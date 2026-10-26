let audioCtx, analyser, dataArray;
let mediaStream;
let listening = false;

// Aynı kodu tekrar okumamak için durum değişkenleri
let lastDecoded = "";
let silenceTimer = 0;

async function startListening() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false, // Ödevde özellikle istenmiş: kapatılmalı!
                autoGainControl: false,  // Ödevde özellikle istenmiş: kapatılmalı!
                noiseSuppression: false
            }
        });

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(mediaStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 2048;
        source.connect(analyser);

        dataArray = new Uint8Array(analyser.frequencyBinCount);
        listening = true;
        document.getElementById('status').innerText = "Durum: Dinleniyor...";
        document.getElementById('startListenBtn').disabled = true;
        
        detectTones();
    } catch (err) {
        alert("Mikrofon erişimi reddedildi veya hata oluştu: " + err.message);
    }
}

// Frekansları Analiz Etme
function detectTones() {
    if (!listening) return;
    requestAnimationFrame(detectTones);

    analyser.getByteFrequencyData(dataArray);
    
    // DTMF frekansları için tepe noktalarını kontrol et
    const binSize = audioCtx.sampleRate / analyser.fftSize;
    
    function checkFreq(freq) {
        let index = Math.round(freq / binSize);
        // Yanındaki binalara da bakarak daha güvenilir tespit
        return dataArray[index-2] + dataArray[index-1] + dataArray[index] + dataArray[index+1] + dataArray[index+2];
    }

    // Hangi tuş basılıysa iki frekansında yüksek olması gerekir
    const threshold = 400; // Kalibrasyon gerektirebilir
    
    let hitFreqs = [];
    const freqs = [697, 770, 852, 941, 1209, 1336, 1477];
    
    freqs.forEach(f => {
        if (checkFreq(f) > threshold) hitFreqs.push(f);
    });

    if (hitFreqs.length === 2) {
        let digit = getDigitFromFreqs(hitFreqs[0], hitFreqs[1]);
        if (digit) {
            processDigit(digit);
        }
    } else {
        // Ses kesildi (Boşluk algılandı)
        processSilence();
    }
}

function getDigitFromFreqs(f1, f2) {
    let low = Math.min(f1, f2);
    let high = Math.max(f1, f2);
    
    if (low === 697 && high === 1209) return '1';
    if (low === 697 && high === 1336) return '2';
    if (low === 697 && high === 1477) return '3';
    if (low === 770 && high === 1209) return '4';
    if (low === 770 && high === 1336) return '5';
    if (low === 770 && high === 1477) return '6';
    if (low === 852 && high === 1209) return '7';
    if (low === 852 && high === 1336) return '8';
    if (low === 852 && high === 1477) return '9';
    if (low === 941 && high === 1336) return '0';
    return null;
}

let currentBuffer = "";
function processDigit(digit) {
    if (!currentBuffer.includes(digit)) { // Aynı saniyede aynı sesi tekrar yazmasın
        currentBuffer += digit;
        if (currentBuffer.length === 4) {
            lastDecoded = currentBuffer;
            generateQR(lastDecoded);
            currentBuffer = ""; // Sıfırla
        }
    }
}

function processSilence() {
    // Eğer kısa bir sessizlik olduysa yarım kalan kodu sıfırla
    // (Ödevdeki "Karışma ve Yanlış Okuma Engeli" maddesi)
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
        currentBuffer = ""; 
    }, 200); 
}

function generateQR(code) {
    document.getElementById('decodedCode').innerText = code;
    let ogrenciNo = document.getElementById('ogrenciNo').value;
    
    if (!ogrenciNo) {
        alert("Lütfen öğrenci numaranızı girin!");
        return;
    }

    let qrContent = code + ogrenciNo; // Ödevdeki "4 haneli kod + öğrenci numarası" kuralı
    document.getElementById('qrcode').innerHTML = "";
    
    let qr = qrcode(0, 'L');
    qr.addData(qrContent);
    qr.make();
    document.getElementById('qrcode').innerHTML = qr.createImgTag(5);
}

document.getElementById('startListenBtn').addEventListener('click', startListening);

// Manuel Giriş
document.getElementById('manuelBtn').addEventListener('click', () => {
    let mKod = document.getElementById('manuelKod').value;
    if (mKod.length === 4) {
        generateQR(mKod);
    } else {
        alert("Lütfen 4 haneli kodu girin.");
    }
});