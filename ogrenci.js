let audioCtx, analyser, dataArray;
let mediaStream;
let listening = false;

let currentBuffer = "";
let silenceTimer = null;

// Debug için: ekranda hangi frekansların vurduğunu görmek isterseniz true yapın
const DEBUG = true; 

async function startListening() {
    try {
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: false,
                autoGainControl: false,
                noiseSuppression: false
            }
        });

        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(mediaStream);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 4096; // Daha hassas frekans çözünürlüğü için büyüttük
        analyser.smoothingTimeConstant = 0.3; 
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

function getFrequencyValue(targetFreq) {
    // FFT bin boyutunu hesapla (örneğin 48000Hz / 4096 = 11.7 Hz)
    const binSize = audioCtx.sampleRate / analyser.fftSize;
    let index = Math.round(targetFreq / binSize);
    
    // Hedef binin etrafındaki ±3 binin ortalamasını al (daha kararlı)
    let sum = 0, count = 0;
    for (let i = -3; i <= 3; i++) {
        if (dataArray[index + i] !== undefined) {
            sum += dataArray[index + i];
            count++;
        }
    }
    return sum / count;
}

function detectTones() {
    if (!listening) return;
    requestAnimationFrame(detectTones);

    analyser.getByteFrequencyData(dataArray);
    
    // DTMF frekanslarının her birini ayrı ayrı ölç
    const f697 = getFrequencyValue(697);
    const f770 = getFrequencyValue(770);
    const f852 = getFrequencyValue(852);
    const f941 = getFrequencyValue(941);
    const f1209 = getFrequencyValue(1209);
    const f1336 = getFrequencyValue(1336);
    const f1477 = getFrequencyValue(1477);

    if (DEBUG) {
        // Ekranda canlı frekans değerlerini göster (Sorun tespiti için)
        let debugDiv = document.getElementById('debugInfo');
        if(!debugDiv) {
            debugDiv = document.createElement('pre');
            debugDiv.id = 'debugInfo';
            debugDiv.style.cssText = "background:#222; color:#0f0; padding:10px; font-size:12px;";
            document.body.appendChild(debugDiv);
        }
        debugDiv.innerText = 
            `697:${f697.toFixed(0)} | 770:${f770.toFixed(0)} | 852:${f852.toFixed(0)} | 941:${f941.toFixed(0)}\n` +
            `1209:${f1209.toFixed(0)} | 1336:${f1336.toFixed(0)} | 1477:${f1477.toFixed(0)}`;
    }

    // EŞİK DEĞERLERİ (Kalibrasyon gerekebilir)
    const HIGH_THRESHOLD = 100; // Ana ses çok yüksekse bu değeri artırın (örn: 150)
    const LOW_THRESHOLD = 30;   // Hiçbir ses yoksa bu değerin altında kalır

    // Hangi sütun (high frekans) ve satır (low frekans) aktif?
    let lowActive = null;
    let highActive = null;

    if (f697 > HIGH_THRESHOLD) lowActive = 697;
    else if (f770 > HIGH_THRESHOLD) lowActive = 770;
    else if (f852 > HIGH_THRESHOLD) lowActive = 852;
    else if (f941 > HIGH_THRESHOLD) lowActive = 941;

    if (f1209 > HIGH_THRESHOLD) highActive = 1209;
    else if (f1336 > HIGH_THRESHOLD) highActive = 1336;
    else if (f1477 > HIGH_THRESHOLD) highActive = 1477;

    // Her iki frekans da aktifse rakamı bul
    if (lowActive !== null && highActive !== null) {
        let digit = getDigitFromFreqs(lowActive, highActive);
        if (digit) processDigit(digit);
    } else if (f697 < LOW_THRESHOLD && f770 < LOW_THRESHOLD && f852 < LOW_THRESHOLD && f941 < LOW_THRESHOLD) {
        // Tam sessizlik algılandı
        processSilence();
    }
}

function getDigitFromFreqs(low, high) {
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

function processDigit(digit) {
    // Aynı rakamın tekrar tekrar eklenmesini engelle (Sadece son karakterden farklıysa ekle)
    if (currentBuffer.length > 0 && currentBuffer[currentBuffer.length - 1] === digit) return;
    
    currentBuffer += digit;
    document.getElementById('decodedCode').innerText = currentBuffer;

    // 4 haneye ulaşıldıysa QR üret
    if (currentBuffer.length === 4) {
        generateQR(currentBuffer);
        currentBuffer = ""; // Sıfırla
    }
}

function processSilence() {
    clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
        // 400ms sessizlik olduysa ve kod yarım kaldıysa iptal et
        if (currentBuffer.length > 0 && currentBuffer.length < 4) {
            document.getElementById('decodedCode').innerText = "---";
            currentBuffer = "";
        }
    }, 400);
}

function generateQR(code) {
    let ogrenciNo = document.getElementById('ogrenciNo').value;
    
    if (!ogrenciNo) {
        alert("Lütfen öğrenci numaranızı girin!");
        return;
    }

    let qrContent = code + ogrenciNo;
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