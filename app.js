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
    currentPol: 0,          // <-- НОВОЕ поле для поляризации
    targetAz: 0,
    targetEl: 0,
    searchAz: 0,
    searchEl: 0,
    showSearchRange: false,

    // Спутники
    satellites: [],
    selectedSatellite: null,

    // Порог
    lockThreshold: null,

    // Режим
    mode: 'auto', // 'auto' | 'manual' | 'reference'

    // Референсные поправки
    refCorrections: null, // { deltaAz, deltaEl, deltaPol } или null

    // Координаты места (загружаются из place_params)
    placeLon: null,
    placeLat: null,

    // Инициализация
    init: function() {
        this.azimuthCanvas = document.getElementById('azimuthCanvas');
        this.elevationCanvas = document.getElementById('elevationCanvas');
        this.azCtx = this.azimuthCanvas.getContext('2d');
        this.elCtx = this.elevationCanvas.getContext('2d');

        // Инициализация навигации
        this.initNavigation();

        // Инициализация переключателя режимов
        this.initModeToggle();

        // Начальная отрисовка
        drawAzimuth(0);
        drawElevation(0);

        // Загрузка данных
        loadSatellites();
        loadAntennaParams();
        loadLockThreshold();
        loadPlaceParams();

        // Запуск цикла телеметрии
        setInterval(fetchTelemetry, 333);
        fetchTelemetry();
    },

    initNavigation: function() {
        const navBtns = document.querySelectorAll('.nav-btn');
        const pages = {
            index: document.getElementById('page-index'),
            params: document.getElementById('page-params')
        };

        navBtns.forEach(btn => {
            btn.addEventListener('click', function() {
                const page = this.dataset.page;
                navBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                Object.keys(pages).forEach(key => {
                    pages[key].classList.toggle('hidden', key !== page);
                });
            });
        });
    },

    initModeToggle: function() {
        const buttons = document.querySelectorAll('#modeToggle .btn');
        const autoMode = document.getElementById('autoMode');
        const manualMode = document.getElementById('manualMode');
        const referenceMode = document.getElementById('referenceMode');

        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                const mode = this.dataset.mode;
                buttons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                App.mode = mode;
                // Прячем все панели
                autoMode.classList.add('hidden');
                manualMode.classList.add('hidden');
                referenceMode.classList.add('hidden');
                // Показываем нужную
                if (mode === 'auto') {
                    autoMode.classList.remove('hidden');
                } else if (mode === 'manual') {
                    manualMode.classList.remove('hidden');
                } else if (mode === 'reference') {
                    referenceMode.classList.remove('hidden');
                    // Обновляем списки в референсном режиме
                    updateRefSatelliteSelects();
                }
            });
        });
    }
};

// При загрузке DOM инициализируем приложение
document.addEventListener('DOMContentLoaded', () => App.init());