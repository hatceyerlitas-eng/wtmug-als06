let audioCtx, analyser, dataArray;
let mediaStream;
let listening = false;

let currentBuffer = "";
let sonRakam = null; // Aynı rakamın tekrarını engellemek için
let sesAktifMi = false; // Sesin şu an çalıp çalmadığını tutar

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
        analyser.fftSize = 4096;
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
    const binSize = audioCtx.sampleRate / analyser.fftSize;
    let index = Math.round(targetFreq / binSize);
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
    
    const f697 = getFrequencyValue(697);
    const f770 = getFrequencyValue(770);
    const f852 = getFrequencyValue(852);
    const f941 = getFrequencyValue(941);
    const f1209 = getFrequencyValue(1209);
    const f1336 = getFrequencyValue(1336);
    const f1477 = getFrequencyValue(1477);

    const HIGH_THRESHOLD = 100; // Ses eşiği (Ortama göre 100-200 arası değiştirin)

    let lowActive = null;
    let highActive = null;

    if (f697 > HIGH_THRESHOLD) lowActive = 697;
    else if (f770 > HIGH_THRESHOLD) lowActive = 770;
    else if (f852 > HIGH_THRESHOLD) lowActive = 852;
    else if (f941 > HIGH_THRESHOLD) lowActive = 941;

    if (f1209 > HIGH_THRESHOLD) highActive = 1209;
    else if (f1336 > HIGH_THRESHOLD) highActive = 1336;
    else if (f1477 > HIGH_THRESHOLD) highActive = 1477;

    // Eğer iki frekans da yüksekse ses geliyor demektir
    let suAnSesVar = (lowActive !== null && highActive !== null);

    if (suAnSesVar && !sesAktifMi) {
        // 📌 SES YENİ BAŞLADI (Yükselen Kenar)
        sesAktifMi = true;
        
        let digit = getDigitFromFreqs(lowActive, highActive);
        if (digit && digit !== sonRakam) {
            // Yeni bir rakam algılandı
            processDigit(digit);
            sonRakam = digit;
        }
    } 
    else if (!suAnSesVar && sesAktifMi) {
        // 📌 SES BİTTİ (Düşen Kenar)
        sesAktifMi = false;
        sonRakam = null; // Bir sonraki rakam için sıfırla
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
    currentBuffer += digit;
    document.getElementById('decodedCode').innerText = currentBuffer;

    if (currentBuffer.length === 4) {
        generateQR(currentBuffer);
        // QR oluşturulduktan hemen sonra buffer'ı sıfırla
        // Böylece yeni gelen kod baştan okunur
        setTimeout(() => { currentBuffer = ""; }, 500); 
    }
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

document.getElementById('manuelBtn').addEventListener('click', () => {
    let mKod = document.getElementById('manuelKod').value;
    if (mKod.length === 4) {
        generateQR(mKod);
    } else {
        alert("Lütfen 4 haneli kodu girin.");
    }
});