// script.js
// --- DOM References ---
const imageLoader = document.getElementById('imageLoader');
const colorPicker = document.getElementById('colorPicker');
const thicknessSlider = document.getElementById('thicknessSlider');
const thicknessInput = document.getElementById('thicknessInput');
const thicknessValueSpan = document.getElementById('thicknessValue');
const thicknessWarning = document.getElementById('thicknessWarning');
const smoothingSlider = document.getElementById('smoothingSlider');
const smoothingValueSpan = document.getElementById('smoothingValue');
const canvas = document.getElementById('canvas');
const downloadButton = document.getElementById('downloadButton');
const downloadLink = document.getElementById('downloadLink');
const processingIndicator = document.getElementById('processingIndicator');
const ctx = canvas.getContext('2d');

// --- State Variables ---
let currentImage = null;
let outlineColor = colorPicker.value;
let thicknessFactor = parseFloat(thicknessSlider.value);
let smoothingFactor = parseFloat(smoothingSlider.value);
let isProcessing = false;

// --- Constants ---
const MAX_SAFE_THICKNESS = 500;
const MAX_INPUT_THICKNESS = 1000000;
const MAX_SLIDER_THICKNESS = 1000;
const MAX_SMOOTHING = 100;
const MIN_SMOOTHING = 0;
const DEFAULT_SMOOTHING = 96.1; // Соответствует порогу ~10

// --- Event Listeners ---
imageLoader.addEventListener('change', handleImageUpload);
colorPicker.addEventListener('input', () => { outlineColor = colorPicker.value; triggerProcessing(); });

// Thickness Listeners (Simplified)
thicknessSlider.addEventListener('input', () => {
    thicknessFactor = parseFloat(thicknessSlider.value);
    thicknessInput.value = thicknessFactor.toFixed(1); // Обновляем поле ввода
    updateThicknessLabel();
    checkThicknessWarning();
    triggerProcessingDebounced();
});

thicknessInput.addEventListener('input', () => {
    let valueStr = thicknessInput.value;
    // Не обрабатываем пустое или невалидное значение во время ввода
    if (!valueStr || isNaN(parseFloat(valueStr))) {
        // Можно добавить визуальный индикатор ошибки ввода, если нужно
        return; // Не обновляем state и не запускаем обработку
    }

    let value = parseFloat(valueStr);
    value = Math.max(1, Math.min(MAX_INPUT_THICKNESS, value)); // Ограничиваем

    thicknessFactor = value; // Обновляем состояние

    // Обновляем слайдер, только если значение в его пределах
    if (value >= 1 && value <= MAX_SLIDER_THICKNESS) {
        thicknessSlider.value = value;
    }
    // Если значение больше max слайдера, сам слайдер не трогаем,
    // но состояние thicknessFactor уже обновлено.

    updateThicknessLabel();
    checkThicknessWarning();
    triggerProcessingDebounced(); // Запускаем обработку после валидного ввода
});

// Smoothing Listener
smoothingSlider.addEventListener('input', () => {
    smoothingFactor = parseFloat(smoothingSlider.value);
    updateSmoothingLabel();
    triggerProcessingDebounced();
});

downloadButton.addEventListener('click', downloadImage);

// --- Functions ---

function handleImageUpload(event) {
    console.log("handleImageUpload started");
    const file = event.target.files[0];
    if (file && file.type === 'image/png') {
        const reader = new FileReader();
        reader.onload = function(e) {
            console.log("FileReader onload");
            const img = new Image();
            img.onload = () => {
                console.log("Image loaded");
                currentImage = img;
                triggerProcessing(); // Запуск первой обработки
            }
            img.onerror = () => {
                console.error("Image loading error");
                alert('Не удалось загрузить изображение.');
                currentImage = null;
                setProcessing(false);
                downloadButton.disabled = true;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
            img.src = e.target.result;
        }
        reader.readAsDataURL(file);
    } else if (file) {
        console.warn("Invalid file type selected");
        alert('Пожалуйста, выберите файл в формате PNG.');
        imageLoader.value = '';
    } else {
        console.log("No file selected");
    }
}

function updateThicknessLabel() { thicknessValueSpan.textContent = thicknessFactor.toFixed(1); }
function checkThicknessWarning() { thicknessWarning.style.display = thicknessFactor > MAX_SAFE_THICKNESS ? 'block' : 'none'; }
function updateSmoothingLabel() { smoothingValueSpan.textContent = smoothingFactor.toFixed(1); }

function hexToRgb(hex) { /* ... (без изменений) ... */
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

function setProcessing(state) {
    console.log("setProcessing:", state);
    isProcessing = state;
    processingIndicator.style.display = state ? 'block' : 'none';
    imageLoader.disabled = state;
    colorPicker.disabled = state;
    thicknessSlider.disabled = state;
    thicknessInput.disabled = state;
    smoothingSlider.disabled = state;
    downloadButton.disabled = state || !currentImage;
}

const triggerProcessingDebounced = debounce(() => { triggerProcessing(); }, 200); // Увеличил задержку немного

function triggerProcessing() {
    console.log("triggerProcessing called. Has image?", !!currentImage, "Is processing?", isProcessing);
    if (currentImage && !isProcessing) {
        setProcessing(true);
        requestAnimationFrame(() => { // Даем UI обновиться перед тяжелой задачей
            try {
                console.log("Starting processImage via requestAnimationFrame");
                processImage();
            } catch (error) {
                console.error("!!! Ошибка во время вызова processImage:", error);
                alert("Произошла критическая ошибка во время обработки изображения. Подробности в консоли.");
            } finally {
                // Убедимся, что флаг сбрасывается, даже если была ошибка внутри processImage
                 setProcessing(false);
                 console.log("Processing finished or aborted, setProcessing(false)");
            }
        });
    } else if (!currentImage) {
         downloadButton.disabled = true;
    }
}

// --- Главная функция обработки ---
// --- Главная функция обработки ---
function processImage() {
    console.log("--- processImage START ---");
    if (!currentImage || !ctx) { /* ... */ return; }

    // --- Шаг 0: Подготовка ---
    console.time("Total Processing Time");
    const imgWidth = currentImage.width;
    const imgHeight = currentImage.height;

    // 1. Расчет радиуса и начального смещения (с ДИНАМИЧЕСКИМ запасом)
    console.log("Step 1: Calculating radius and initial offset...");
    const baseThickness = Math.max(1, Math.round(Math.max(imgWidth, imgHeight) / 100));
    // Используем / 100.0 для масштабирования радиуса, как запрошено
    const radius = Math.max(1, Math.ceil(baseThickness * (thicknessFactor / 100.0)));
    // Динамический запас: базовые 5px + ~10% от радиуса
    const dynamicSafetyMargin = Math.ceil(radius * 0.1) + 5;
    const initialOffset = radius + dynamicSafetyMargin; // Используем динамический запас
    console.log(`Image Size: ${imgWidth}x${imgHeight}, Factor: ${thicknessFactor.toFixed(1)}, Radius: ${radius}, Dynamic Safety Margin: ${dynamicSafetyMargin}, Initial Offset: ${initialOffset}`);

    // 2. Размеры холста для генерации маски (с ДИНАМИЧЕСКИМ запасом)
    console.log("Step 2: Calculating generation canvas size...");
    const genWidth = imgWidth + 2 * initialOffset; // Используем initialOffset
    const genHeight = imgHeight + 2 * initialOffset; // Используем initialOffset

    // Проверка на разумный размер холста генерации
    const maxCanvasDim = 800000;
    const maxCanvasArea = maxCanvasDim * maxCanvasDim;
    console.log(`Generation canvas size: ${genWidth}x${genHeight}`);
    if (genWidth > maxCanvasDim || genHeight > maxCanvasDim || genWidth * genHeight > maxCanvasArea) {
         console.error(`ERROR: Generation canvas size (${genWidth}x${genHeight}) exceeds limits.`);
         alert(`Ошибка: Расчетный размер холста для генерации (${genWidth}x${genHeight}) слишком велик. Уменьшите толщину.`);
         console.timeEnd("Total Processing Time");
         return; // Прерываем здесь, setProcessing(false) будет вызван в finally
    }

    // 3. Временные холсты
    console.log("Step 3: Creating temporary canvases...");
    let tempCanvas, tempCtx, alphaMaskCanvas, maskCtx;
    try {
        // Холст для получения пикселей оригинала
        tempCanvas = document.createElement('canvas');
        tempCanvas.width = imgWidth; tempCanvas.height = imgHeight;
        tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });
        tempCtx.drawImage(currentImage, 0, 0);

        // Холст для генерации маски (большой, с динамическим запасом)
        alphaMaskCanvas = document.createElement('canvas');
        alphaMaskCanvas.width = genWidth; alphaMaskCanvas.height = genHeight;
        maskCtx = alphaMaskCanvas.getContext('2d', { willReadFrequently: true });
        console.log("Temporary canvases created.");
    } catch (e) { /* ... (error handling) ... */ return; }

    // 4. Получение пиксельных данных
    console.log("Step 4: Getting source pixel data...");
    let imageData;
    try { imageData = tempCtx.getImageData(0, 0, imgWidth, imgHeight); }
    catch (e) { /* ... (error handling) ... */ return; }
    const pixels = imageData.data;
    console.log("Source pixel data obtained.");

    // --- Шаг 5-7: Генерация финальной резкой маски на alphaMaskCanvas ---
    console.log("Step 5: Drawing initial alpha mask...");
    console.time("Draw Initial Mask");
    maskCtx.fillStyle = '#ffffff';
    for (let y = 0; y < imgHeight; y++) {
        for (let x = 0; x < imgWidth; x++) {
            const alpha = pixels[(y * imgWidth + x) * 4 + 3];
            if (alpha > 0) {
                maskCtx.globalAlpha = alpha / 255.0;
                maskCtx.fillRect(x + initialOffset, y + initialOffset, 1, 1); // Используем initialOffset
            }
        }
    }
    maskCtx.globalAlpha = 1.0;
    console.timeEnd("Draw Initial Mask");

    console.log("Step 6: Applying Gaussian Blur...");
    console.time("Blur Filter");
    if (radius > 0) {
        try {
            maskCtx.filter = `blur(${radius}px)`;
            maskCtx.drawImage(alphaMaskCanvas, 0, 0);
            maskCtx.filter = 'none';
        } catch (e) { /* ... (error handling) ... */ }
    }
    console.timeEnd("Blur Filter");

    console.log("Step 7: Thresholding mask...");
    console.time("Thresholding");
    const alphaThreshold = Math.max(1, Math.round((MAX_SMOOTHING - smoothingFactor) * 2.54));
    console.log(`Using Smoothing Factor: ${smoothingFactor.toFixed(1)}, Alpha Threshold: ${alphaThreshold}`);
    let maskImageData;
    try { maskImageData = maskCtx.getImageData(0, 0, genWidth, genHeight); }
    catch (e) { /* ... (error handling) ... */ return; }
    const maskPixels = maskImageData.data;
    for (let i = 0; i < maskPixels.length; i += 4) {
        maskPixels[i + 3] = (maskPixels[i + 3] >= alphaThreshold) ? 255 : 0;
    }
    try { maskCtx.putImageData(maskImageData, 0, 0); }
    catch (e) { /* ... (error handling) ... */ return; }
    console.timeEnd("Thresholding");
    console.log("Final sharp mask generated.");

    // --- Шаг 8: Анализ границ финальной маски ---
    console.log("Step 8: Analyzing mask bounds...");
    console.time("Analyze Bounds");
    let minX = genWidth, minY = genHeight, maxX = -1, maxY = -1;
    let foundPixel = false;
    for (let y = 0; y < genHeight; y++) {
        for (let x = 0; x < genWidth; x++) {
            // Ищем по альфа-каналу (оптимизация)
            if (maskPixels[(y * genWidth + x) * 4 + 3] === 255) {
                if (!foundPixel) foundPixel = true;
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
                // Оптимизация: если нашли пиксель в строке, можно пропустить остальные пиксели левее minX и правее maxX в этой же строке? Нет, так как minX/maxX могут измениться.
            }
        }
    }
    console.timeEnd("Analyze Bounds");

    // --- Шаг 9: Расчет финальных размеров и настройка основного холста ---
    let finalWidth, finalHeight;
    if (!foundPixel) { /* ... (как было) ... */
        finalWidth = 1; finalHeight = 1; minX = 0; minY = 0;
    } else { /* ... (как было) ... */
        finalWidth = maxX - minX + 1; finalHeight = maxY - minY + 1;
        console.log(`Final Canvas Size: ${finalWidth}x${finalHeight}`);
    }

    try { canvas.width = finalWidth; canvas.height = finalHeight; }
    catch (e) { /* ... (как было) ... */ return; }
    const finalCtx = canvas.getContext('2d');
    if (!finalCtx) { /* ... (как было) ... */ return; }

    // --- Шаг 10: Отрисовка финального результата на подогнанный холст ---
    console.log("Step 10: Drawing final result...");
    console.time("Draw Final Image");
    if (foundPixel) {
        // 1. Заливаем цветом обводки
        finalCtx.fillStyle = outlineColor;
        finalCtx.fillRect(0, 0, finalWidth, finalHeight);

        // 2. Рисуем нужную часть маски с 'destination-in'
        finalCtx.globalCompositeOperation = 'destination-in';
        finalCtx.drawImage(alphaMaskCanvas,
            minX, minY, finalWidth, finalHeight, // Source rect from mask canvas
            0, 0, finalWidth, finalHeight       // Destination rect on final canvas
        );

        // 3. Сбрасываем режим и рисуем оригинал со смещением
        finalCtx.globalCompositeOperation = 'source-over';
        const originalDrawX = initialOffset - minX; // Используем initialOffset
        const originalDrawY = initialOffset - minY; // Используем initialOffset
        finalCtx.drawImage(currentImage, originalDrawX, originalDrawY);

    } else { /* ... (как было) ... */
        finalCtx.clearRect(0, 0, finalWidth, finalHeight);
    }
    console.timeEnd("Draw Final Image");

    console.timeEnd("Total Processing Time");
    console.log("--- processImage END ---");
}


function downloadImage() { /* ... (без изменений) ... */
    if (!currentImage || isProcessing) return;
    const dataURL = canvas.toDataURL('image/png');
    const filename = `outlined_T${thicknessFactor.toFixed(0)}_S${smoothingFactor.toFixed(1)}_${outlineColor.substring(1)}_${Date.now()}.png`;
    downloadLink.href = dataURL;
    downloadLink.download = filename;
    downloadLink.click();
}

let debounceTimer;
function debounce(func, delay) { /* ... (без изменений) ... */
     return function(...args) {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}

// --- Инициализация ---
console.log("Initializing...");
updateThicknessLabel();
updateSmoothingLabel();
checkThicknessWarning();
downloadButton.disabled = true;
setProcessing(false);
console.log("Initialization complete.");