// =========================================================
// DEĞİŞKENLER VE VERİ YAPILARI
// =========================================================
let audioCtx;
let isPlaying = false;
let currentCode = "";
let html5QrcodeScanner = null;
let kameraAcik = false;

let studentsData = [];
let coursesData = [];

// Hoca panelinde seçilen aktif ders ve hafta (index.html'den gelecek)
// Test için index.html'e ekleyeceğimiz select kutularından çekeceğiz.
let aktifDersKodu = "";
let aktifHafta = 1;

// DTMF Frekansları (Tuş takımı frekansları)
const dtmfFreqs = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '0': [941, 1336]
};

// =========================================================
// 1. JSON VERİLERİNİ YÜKLE
// =========================================================
async function loadData() {
    try {
        const sRes = await fetch('students.json');
        studentsData = await sRes.json();
        
        const cRes = await fetch('courses.json');
        coursesData = await cRes.json();

        // Ders seçim kutusunu doldur
        const dersSelect = document.getElementById('dersSec');
        if(dersSelect) {
            coursesData.forEach(c => {
                let opt = document.createElement('option');
                opt.value = c.dersKodu;
                opt.innerText = c.dersAdi;
                dersSelect.appendChild(opt);
            });
        }
    } catch(e) {
        console.error("JSON dosyaları yüklenemedi. Live Server ile açtığınızdan emin olun.", e);
    }
}
loadData();

// =========================================================
// 2. SES YAYINLAMA (DTMF) KISMI
// =========================================================
function playTone(freqs, duration) {
    return new Promise(resolve => {
        const osc1 = audioCtx.createOscillator();
        const osc2 = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        osc1.frequency.value = freqs[0];
        osc2.frequency.value = freqs[1];
        
        osc1.connect(gainNode);
        osc2.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        osc1.start();
        osc2.start();
        
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (duration/1000) - 0.05);

        setTimeout(() => {
            osc1.stop();
            osc2.stop();
            resolve();
        }, duration);
    });
}

async function yayinDongusu() {
    if (!isPlaying) return;

    // Rastgele 4 haneli kod üret
    currentCode = Math.floor(1000 + Math.random() * 9000).toString();
    document.getElementById('displayCode').innerText = currentCode;
    
    // Öğrenci tarafının doğrulaması için aktif kodu localStorage'a da yazalım
    localStorage.setItem('aktifKriptoKod', currentCode);

    // 4 haneli kodu ses olarak çal (Her hane 650ms, aralarında 350ms boşluk)
    for (let i = 0; i < currentCode.length; i++) {
        if (!isPlaying) break;
        let digit = currentCode[i];
        await playTone(dtmfFreqs[digit], 650);
        // Sessizlik beklemesi
        await new Promise(r => setTimeout(r, 350));
    }

    // Döngü: Yeni kod için bekle (Ses yaklaşık 4 sn sürdü, toplam 12 saniyeye tamamla)
    setTimeout(() => {
        if (isPlaying) yayinDongusu();
    }, 8000); 
}

// =========================================================
// 3. KAMERA VE QR OKUMA KISMI
// =========================================================
function startCamera() {
    if(kameraAcik) return;
    document.getElementById('reader').style.display = 'block';
    document.getElementById('openCameraBtn').innerText = "Manuel Kamera Kapat";
    
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    html5QrcodeScanner.render(onScanSuccess);
    kameraAcik = true;
}

function stopCamera() {
    if(html5QrcodeScanner && kameraAcik) {
        html5QrcodeScanner.clear().then(() => {
            document.getElementById('reader').style.display = 'none';
            document.getElementById('openCameraBtn').innerText = "Manuel Kamera Aç";
            kameraAcik = false;
            html5QrcodeScanner = null;
        }).catch(err => console.error("Kamera kapatılamadı", err));
    }
}

// =========================================================
// 4. QR OKUNDUĞUNDA ÇALIŞACAK FONKSİYON
// =========================================================
async function onScanSuccess(decodedText, decodedResult) {
    // QR içeriği: 4 haneli kod + Öğrenci No (Örn: "12342024001")
    if (decodedText.length < 5) return; 

    let gelenKod = decodedText.substring(0, 4);
    let ogrNo = decodedText.substring(4);

    let uyariAlani = document.getElementById('uyariAlani');
    uyariAlani.style.color = "red";

    // 1. KONTROL: Kod doğru mu?
    if (gelenKod !== currentCode) {
        uyariAlani.innerText = "HATA: Kod eşleşmiyor! Eski veya geçersiz QR.";
        document.getElementById('studentInfoCard').style.display = 'block';
        return; // Okumaya devam etsin, kamerayı kapatma
    }

    // 2. KONTROL: Ders ve Hafta seçilmiş mi?
    let dersSec = document.getElementById('dersSec').value;
    let haftaSec = document.getElementById('haftaSec').value;
    
    if (!dersSec || !haftaSec) {
        alert("Lütfen önce Ders ve Hafta seçin!");
        return;
    }
    aktifDersKodu = dersSec;
    aktifHafta = parseInt(haftaSec);

    // 3. KONTROL: Öğrenci sistemde var mı?
    let ogrenci = studentsData.find(o => o.no === ogrNo);
    if (!ogrenci) {
        uyariAlani.innerText = "HATA: Bu numaraya ait öğrenci bulunamadı!";
        document.getElementById('studentInfoCard').style.display = 'block';
        return;
    }

    // 4. KONTROL: Öğrenci bu derse kayıtlı mı? (courses.json kontrolü)
    let ders = coursesData.find(c => c.dersKodu === aktifDersKodu);
    if (!ders.kayitliOgrenciler.includes(ogrNo)) {
        uyariAlani.innerText = `HATA: ${ogrenci.ad} bu derse kayıtlı değil!`;
        document.getElementById('studentInfoCard').style.display = 'block';
        return;
    }

    // 5. KONTROL: Öğrenci bu hafta zaten imza attı mı? (Tek İmza Kuralı)
    let kayitKey = `yoklama_${aktifDersKodu}_${ogrNo}`;
    let mevcutImzalar = JSON.parse(localStorage.getItem(kayitKey)) || [];

    if (mevcutImzalar.includes(aktifHafta)) {
        uyariAlani.innerText = `HATA: Öğrenci ${aktifHafta}. hafta zaten yoklamaya katıldı!`;
        document.getElementById('studentInfoCard').style.display = 'block';
        // Bilgileri yine de gösterelim ki hoca kim olduğunu görsün
        bilgileriGoster(ogrenci);
        return; 
    }

    // --- HER ŞEY TAMAM ---
    // Kamera başarılı okumada otomatik kapanmalı (Ödev şartı)
    stopCamera();
    
    // Başarılı mesajı
    uyariAlani.style.color = "green";
    uyariAlani.innerText = "✔ Yoklama Başarıyla Kaydedildi!";
    
    // Bilgileri ve fotoğrafı göster
    bilgileriGoster(ogrenci);

    // Yoklamayı localStorage'a kaydet
    mevcutImzalar.push(aktifHafta);
    localStorage.setItem(kayitKey, JSON.stringify(mevcutImzalar));
}

// =========================================================
// 5. EKRANA BİLGİ VE FOTOĞRAF BASMA FONKSİYONU
// =========================================================
function bilgileriGoster(ogrenci) {
    document.getElementById('ogrAd').innerText = ogrenci.ad + " " + ogrenci.soyad;
    document.getElementById('ogrNo').innerText = ogrenci.no;
    document.getElementById('ogrBolum').innerText = ogrenci.bolum;
    document.getElementById('ogrProgram').innerText = ogrenci.program;
    document.getElementById('ogrSinif').innerText = ogrenci.sinif;
    
    // 📸 FOTOĞRAFI GÖSTERME KISMI
    let fotoPath = `photos/${ogrenci.no}.jpeg`;
    let fotoElement = document.getElementById('ogrFoto');
    fotoElement.src = fotoPath;
    
    // Eğer fotoğraf bulunamazsa placeholder göster
    fotoElement.onerror = function() {
        this.src = 'https://via.placeholder.com/150?text=Foto+Yok';
    };

    document.getElementById('studentInfoCard').style.display = 'block';
}

// =========================================================
// 6. BUTON OLAYLARI
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
    // SES YAYINI BAŞLAT
    document.getElementById('startBtn').addEventListener('click', () => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        if(audioCtx.state === 'suspended') audioCtx.resume();
        
        isPlaying = true;
        document.getElementById('startBtn').disabled = true;
        document.getElementById('stopBtn').disabled = false;
        yayinDongusu();

        // Ödev Şartı: Otomatik Kamera seçiliyse kamerayı aç
        if(document.getElementById('otoKamera').checked) {
            startCamera();
        }
    });

    // SES YAYINI DURDUR
    document.getElementById('stopBtn').addEventListener('click', () => {
        isPlaying = false;
        document.getElementById('startBtn').disabled = false;
        document.getElementById('stopBtn').disabled = true;
        document.getElementById('displayCode').innerText = "----";
    });

    // MANUEL KAMERA AÇ/KAPAT
    document.getElementById('openCameraBtn').addEventListener('click', () => {
        if (kameraAcik) {
            stopCamera();
        } else {
            startCamera();
        }
    });
});