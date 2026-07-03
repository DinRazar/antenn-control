// Глобальный объект приложения
const App = {
    // Канвасы и контексты
    azimuthCanvas: null,
    elevationCanvas: null,
    azCtx: null,
    elCtx: null,

    // Текущие значения
    currentAz: 0,
    currentEl: 0,
    prevEl: 0,
    targetAz: 0,
    targetEl: 0,
    searchAz: 0,      // полный азимут поиска
    searchEl: 0,      // полный угол места поиска
    showSearchRange: false,

    // Спутники
    satellites: [],
    selectedSatellite: null,

    // Порог захвата
    lockThreshold: null,

    // Инициализация
    init: function() {
        this.azimuthCanvas = document.getElementById('azimuthCanvas');
        this.elevationCanvas = document.getElementById('elevationCanvas');
        this.azCtx = this.azimuthCanvas.getContext('2d');
        this.elCtx = this.elevationCanvas.getContext('2d');

        // Начальная отрисовка
        drawAzimuth(0);
        drawElevation(0);

        // Загрузка данных
        loadSatellites();
        loadAntennaParams();
        loadLockThreshold();

        // Запуск цикла телеметрии
        setInterval(fetchTelemetry, 333);
        fetchTelemetry();
    }
};

// При загрузке DOM инициализируем приложение
document.addEventListener('DOMContentLoaded', () => App.init());