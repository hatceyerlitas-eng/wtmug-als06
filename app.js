// ==========================================
// 1. SES YAYINLAMA KISMI (Önceki kodun aynısı)
// ==========================================
let audioCtx;
let isPlaying = false;
let currentCode = "";

const dtmfFreqs = {
    '1': [697, 1209], '2': [697, 1336], '3': [697, 1477],
    '4': [770, 1209], '5': [770, 1336], '6': [770, 1477],
    '7': [852, 1209], '8': [852, 1336], '9': [852, 1477],
    '0': [941, 1336]
};

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
        osc1.start(); osc2.start();
        gainNode.gain.setValueAtTime(1, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (duration/1000) - 0.05);
        setTimeout(() => { osc1.stop(); osc2.stop(); resolve(); }, duration);
    });
}

async function yayinDongusu() {
    if (!isPlaying) return;
    currentCode = Math.floor(1000 + Math.random() * 9000).toString();
    document.getElementById('displayCode').innerText = currentCode;
    // Aktif kodu localStorage'a yaz (Öğrencilerin doğrulaması için gerekebilir)
    localStorage.setItem('aktifKriptoKod', currentCode);

    for (let i = 0; i < currentCode.length; i++) {
        if (!isPlaying) break;
        await playTone(dtmfFreqs[currentCode[i]], 650);
        await new Promise(r => setTimeout(r, 350));
    }
    setTimeout(() => { if (isPlaying) yayinDongusu(); }, 12000 - (4 * 1000));
}

document.getElementById('startBtn').addEventListener('click', () => {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if(audioCtx.state === 'suspended') audioCtx.resume();
    isPlaying = true;
    document.getElementById('startBtn').disabled = true;
    document.getElementById('stopBtn').disabled = false;
    yayinDongusu();

    // Eğer otomatik kamera seçiliyse kamerayı aç
    if(document.getElementById('otoKamera').checked) {
        startCamera();
    }
});

document.getElementById('stopBtn').addEventListener('click', () => {
    isPlaying = false;
    document.getElementById('startBtn').disabled = false;
    document.getElementById('stopBtn').disabled = true;
    document.getElementById('displayCode').innerText = "----";
});

// ==========================================
// 2. KAMERA VE QR OKUMA KISMI
// ==========================================
let html5QrcodeScanner;
let studentsData = [];
let coursesData = [];

// JSON dosyalarını yükle
async function loadData() {
    try {
        const sRes = await fetch('students.json');
        studentsData = await sRes.json();
        const cRes = await fetch('courses.json');
        coursesData = await cRes.json();
    } catch(e) {
        console.error("JSON dosyaları yüklenemedi. Sunucuda çalıştırdığınızdan emin olun.", e);
    }
}
loadData();

function startCamera() {
    document.getElementById('reader').style.display = 'block';
    html5QrcodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 });
    html5QrcodeScanner.render(onScanSuccess);
}

function stopCamera() {
    if(html5QrcodeScanner) {
        html5QrcodeScanner.clear().then(() => {
            document.getElementById('reader').style.display = 'none';
        });
    }
}

document.getElementById('openCameraBtn').addEventListener('click', () => {
    if (document.getElementById('reader').style.display === 'block') {
        stopCamera();
    } else {
        startCamera();
    }
});

// ==========================================
// 3. QR OKUNDUĞUNDA ÇALIŞACAK FONKSİYON
// ==========================================
async function onScanSuccess(decodedText, decodedResult) {
    // QR içeriği: 4 haneli kod + Öğrenci No (Örn: "12342024001")
    if (decodedText.length < 5) return; 

    let gelenKod = decodedText.substring(0, 4);
    let ogrNo = decodedText.substring(4);

    // Kod doğru mu? (O an ekranda olan kod ile eşleşiyor mu?)
    if (gelenKod !== currentCode) {
        // Eşleşmiyorsa uyarı ver ve okumaya devam et
        document.getElementById('uyariAlani').innerText = "HATA: Kod eşleşmiyor! Eski veya geçersiz QR.";
        document.getElementById('studentInfoCard').style.display = 'block';
        return;
    }

    // Öğrenciyi bul
    let ogrenci = studentsData.find(o => o.no === ogrNo);
    if (!ogrenci) {
        alert("Bu numaraya ait öğrenci bulunamadı!");
        return;
    }

    // Kamera başarılı okumada otomatik kapanmalı (Ödev şartı)
    stopCamera();
    document.getElementById('uyariAlani').innerText = "";

    // Ekrana Bilgileri Bas
    document.getElementById('ogrAd').innerText = ogrenci.ad + " " + ogrenci.soyad;
    document.getElementById('ogrNo').innerText = ogrenci.no;
    document.getElementById('ogrBolum').innerText = ogrenci.bolum;
    document.getElementById('ogrProgram').innerText = ogrenci.program;
    document.getElementById('ogrSinif').innerText = ogrenci.sinif;
    
    // 📸 FOTOĞRAFI GÖSTERME KISMI
    // Fotoğraf yolu: photos/2024001.jpeg
    let fotoPath = `photos/${ogrenci.no}.jpeg`;
    let fotoElement = document.getElementById('ogrFoto');
    fotoElement.src = fotoPath;
    // Eğer fotoğraf bulunamazsa varsayılan bir resim göster
    fotoElement.onerror = function() {
        this.src = 'https://via.placeholder.com/150?text=Foto+Yok';
    };

    document.getElementById('studentInfoCard').style.display = 'block';
}