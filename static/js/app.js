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
    searchAz: 0,
    searchEl: 0,
    showSearchRange: false,

    // Спутники
    satellites: [],
    selectedSatellite: null,

    // Порог
    lockThreshold: null,

    // Режим
    mode: 'auto', // 'auto' | 'manual'

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
        loadPlaceParams();  // <-- добавлен вызов

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
                
                // Обновляем активную кнопку
                navBtns.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                // Показываем нужную страницу
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

        buttons.forEach(btn => {
            btn.addEventListener('click', function() {
                const mode = this.dataset.mode;
                
                // Обновляем активную кнопку
                buttons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                
                // Переключаем режим
                App.mode = mode;
                if (mode === 'auto') {
                    autoMode.classList.remove('hidden');
                    manualMode.classList.add('hidden');
                } else {
                    autoMode.classList.add('hidden');
                    manualMode.classList.remove('hidden');
                }
            });
        });
    }
};

// При загрузке DOM инициализируем приложение
document.addEventListener('DOMContentLoaded', () => App.init());