// ============================================================
// SES ZAMANLAMALARI (Buradan ayarlayacaksınız!)
// ============================================================
const TON_SURESI = 600;          // Her rakam sesi 600ms çalsın (yavaşlatmak için: 800)
const BOSLUK_SURESI = 400;       // Rakamlar arası 400ms sessizlik (artır: 500)
const KOD_ARASI_BEKLEME = 8000;  // Her kod yayını arası bekleme (8 saniye)

// ============================================================
// DEĞİŞKENLER
// ============================================================
let audioCtx = null;
let isPlaying = false;
let currentCode = "";
let html5QrcodeScanner = null;
let kameraAcik = false;

let studentsData = [];
let coursesData = [];

// DTMF Frekansları (Tuş takımı frekansları)
const dtmfFreqs = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '0': [941, 1336]
};

// ============================================================
// VERİLERİ YÜKLE
// ============================================================
async function loadData() {
    try {
        const sRes = await fetch('students.json');
        studentsData = await sRes.json();
        const cRes = await fetch('courses.json');
        coursesData = await cRes.json();

        const dersSelect = document.getElementById('dersSec');
        if (dersSelect) {
            coursesData.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.dersKodu;
                opt.innerText = c.dersAdi;
                dersSelect.appendChild(opt);
            });
        }
        console.log("Veriler yüklendi. Öğrenci:", studentsData.length, "Ders:", coursesData.length);
    } catch (e) {
        alert("JSON dosyaları yüklenemedi! Live Server (HTTPS) ile açtığınızdan emin olun.");
        console.error(e);
    }
}
loadData();

// ============================================================
// SES YAYINI - TEK TON
// ============================================================
function playTone(freqs, duration) {
    return new Promise(resolve => {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc1.frequency.value = freqs[0];
        osc2.frequency.value = freqs[1];
        osc1.type = 'sine';
        osc2.type = 'sine';

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(audioCtx.destination);

        osc1.start();
        osc2.start();

        // Yumuşak başla, yumuşak bitir (frekans çakışması olmasın)
        gain.gain.setValueAtTime(0, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(1, audioCtx.currentTime + 0.02);
        gain.gain.setValueAtTime(1, audioCtx.currentTime + (duration / 1000) - 0.05);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + (duration / 1000));

        setTimeout(() => {
            try { osc1.stop(); osc2.stop(); } catch (e) {}
            resolve();
        }, duration);
    });
}

// ============================================================
// SES YAYIN DÖNGÜSÜ
// ============================================================
async function yayinDongusu() {
    if (!isPlaying) return;

    // Yeni 4 haneli rastgele kod üret
    currentCode = Math.floor(1000 + Math.random() * 9000).toString();
    document.getElementById('displayCode').innerText = currentCode;
    document.getElementById('durumBilgi').innerText = "Durum: Kod yayınlanıyor → " + currentCode;

    // Aktif kodu localStorage'a yaz (öğrenci tarafı doğrulama için)
    localStorage.setItem('aktifKriptoKod', currentCode);
    localStorage.setItem('aktifKodZamani', Date.now().toString());

    // Kodu ses olarak çal
    for (let i = 0; i < currentCode.length; i++) {
        if (!isPlaying) return;
        const digit = currentCode[i];
        await playTone(dtmfFreqs[digit], TON_SURESI);

        // Son rakamdan sonra boşluk koyma
        if (i < currentCode.length - 1) {
            await new Promise(r => setTimeout(r, BOSLUK_SURESI));
        }
    }

    document.getElementById('durumBilgi').innerText = "Durum: Yeni kod için bekleniyor...";

    // Döngü beklemesi
    setTimeout(() => {
        if (isPlaying) yayinDongusu();
    }, KOD_ARASI_BEKLEME);
}

// ============================================================
// KAMERA AÇ
// ============================================================
function startCamera() {
    if (kameraAcik) return;
    document.getElementById('reader').style.display = 'block';
    document.getElementById('openCameraBtn').innerText = "📷 Manuel Kamera Kapat";

    html5QrcodeScanner = new Html5QrcodeScanner("reader", {
        fps: 10,
        qrbox: { width: 250, height: 250 }
    });
    html5QrcodeScanner.render(onScanSuccess, onScanError);
    kameraAcik = true;
}

function onScanError(err) {
    // Sessizce yut, konsolu doldurmasın
}

// ============================================================
// KAMERA KAPAT
// ============================================================
function stopCamera() {
    if (html5QrcodeScanner && kameraAcik) {
        html5QrcodeScanner.clear().then(() => {
            document.getElementById('reader').style.display = 'none';
            document.getElementById('openCameraBtn').innerText = "📷 Manuel Kamera Aç";
            kameraAcik = false;
            html5QrcodeScanner = null;
        }).catch(e => console.error(e));
    }
}

// ============================================================
// QR OKUNDUĞUNDA ÇALIŞACAK FONKSİYON
// ============================================================
async function onScanSuccess(decodedText) {
    if (decodedText.length < 5) return;

    // QR içeriği: 4 haneli kod + Öğrenci No (Örn: "12342024001")
    const gelenKod = decodedText.substring(0, 4);
    const ogrNo = decodedText.substring(4);

    const uyari = document.getElementById('uyariAlani');
    uyari.style.color = 'red';
    uyari.innerText = '';

    // 1. KONTROL: Kripto kod eşleşiyor mu?
    if (gelenKod !== currentCode) {
        uyari.innerText = "❌ HATA: Kod eşleşmiyor! (Eski veya geçersiz QR)";
        document.getElementById('studentInfoCard').style.display = 'block';
        return;
    }

    // 2. KONTROL: Ders ve Hafta seçilmiş mi?
    const dersSec = document.getElementById('dersSec').value;
    const haftaSec = document.getElementById('haftaSec').value;
    if (!dersSec || !haftaSec) {
        alert("Lütfen önce Ders ve Hafta seçin!");
        return;
    }
    const hafta = parseInt(haftaSec);

    // 3. KONTROL: Öğrenci sistemde kayıtlı mı?
    const ogrenci = studentsData.find(o => o.no === ogrNo);
    if (!ogrenci) {
        uyari.innerText = "❌ Bu numaraya ait öğrenci bulunamadı!";
        document.getElementById('studentInfoCard').style.display = 'block';
        return;
    }

    // 4. KONTROL: Öğrenci bu derse kayıtlı mı?
    const ders = coursesData.find(c => c.dersKodu === dersSec);
    if (!ders.kayitliOgrenciler.includes(ogrNo)) {
        uyari.innerText = `❌ ${ogrenci.ad} bu derse kayıtlı değil!`;
        bilgileriGoster(ogrenci);
        return;
    }

    // 5. KONTROL: Tek imza kuralı (haftada 1 kez)
    const kayitKey = `yoklama_${dersSec}_${ogrNo}`;
    const imzalar = JSON.parse(localStorage.getItem(kayitKey)) || [];
    if (imzalar.includes(hafta)) {
        uyari.innerText = `⚠️ Öğrenci ${hafta}. hafta zaten yoklamaya katıldı!`;
        bilgileriGoster(ogrenci);
        return;
    }

    // ✅ TÜM KONTROLLER GEÇTİ - BAŞARILI
    stopCamera();
    uyari.style.color = "green";
    uyari.innerText = "✔ Yoklama başarıyla kaydedildi!";
    bilgileriGoster(ogrenci);

    // localStorage'a kaydet
    imzalar.push(hafta);
    localStorage.setItem(kayitKey, JSON.stringify(imzalar));
}

// ============================================================
// ÖĞRENCİ BİLGİSİNİ EKRANA BASTIR
// ============================================================
function bilgileriGoster(ogrenci) {
    document.getElementById('ogrAd').innerText = ogrenci.ad + " " + ogrenci.soyad;
    document.getElementById('ogrNo').innerText = ogrenci.no;
    document.getElementById('ogrBolum').innerText = ogrenci.bolum;
    document.getElementById('ogrProgram').innerText = ogrenci.program;
    document.getElementById('ogrSinif').innerText = ogrenci.sinif;

    // 📸 FOTOĞRAF: photos/2024001.jpeg formatında
    const foto = document.getElementById('ogrFoto');
    foto.src = `photos/${ogrenci.no}.jpeg`;
    foto.onerror = function() {
        this.src = 'https://via.placeholder.com/150?text=Foto+Yok';
    };

    document.getElementById('studentInfoCard').style.display = 'block';
}

// ============================================================
// BUTON OLAYLARI
// ============================================================
document.addEventListener('DOMContentLoaded', () => {

    // ▶️ YOKLAMAYI BAŞLAT
    document.getElementById('startBtn').addEventListener('click', () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        isPlaying = true;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;

        // Otomatik kamera seçiliyse aç
        if (document.getElementById('otoKamera').checked) {
            startCamera();
        }

        yayinDongusu();
    });

    // ⏹️ DURDUR
    document.getElementById('stopBtn').addEventListener('click', () => {
        isPlaying = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('displayCode').innerText = "----";
        document.getElementById('durumBilgi').innerText = "Durum: Durduruldu.";
    });

    // 📷 MANUEL KAMERA AÇ/KAPAT
    document.getElementById('openCameraBtn').addEventListener('click', () => {
        kameraAcik ? stopCamera() : startCamera();
    });
});