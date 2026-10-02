// Глобальный объект приложения
const App = {
    azimuthCanvas: null,
    elevationCanvas: null,
    azCtx: null,
    elCtx: null,

    currentAz: 0,
    currentEl: 0,
    prevEl: 0,
    currentPol: 0,
    targetAz: 0,
    targetEl: 0,
    searchAz: 0,
    searchEl: 0,
    showSearchRange: false,

    satellites: [],
    selectedSatellite: null,     // выбранный в выпадающем списке
    committedSatellite: null,    // тот, для которого ушёл cmd,sat

    lockThreshold: null,

    mode: 'auto',

    // Референсные поправки (сессионные)
    refCorrections: null,     // { deltaAz, deltaEl, deltaPol }
    referenceSatellite: null, // спутник, по которому считали поправки

    placeLon: null,
    placeLat: null,

    init: function() {
        this.azimuthCanvas = document.getElementById('azimuthCanvas');
        this.elevationCanvas = document.getElementById('elevationCanvas');
        this.azCtx = this.azimuthCanvas.getContext('2d');
        this.elCtx = this.elevationCanvas.getContext('2d');

        this.initNavigation();
        this.initModeToggle();

        drawAzimuth(0);
        drawElevation(0);

        loadSatellites();
        loadAntennaParams();
        loadLockThreshold();
        loadPlaceParams();

        // Обновить состояние кнопки референсного режима
        if (typeof updateRefModeButton === 'function') {
            updateRefModeButton();
        }

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

                // Проверка доступа к референсному режиму
                if (mode === 'reference' && !App.refCorrections) {
                    alert('Референсный режим недоступен.\n\nСначала выполните автоматическое наведение на спутник — система вычислит поправки, и режим станет доступен.');
                    return;
                }

                buttons.forEach(b => b.classList.remove('active'));
                this.classList.add('active');
                App.mode = mode;

                autoMode.classList.add('hidden');
                manualMode.classList.add('hidden');
                referenceMode.classList.add('hidden');

                if (mode === 'auto') {
                    autoMode.classList.remove('hidden');
                } else if (mode === 'manual') {
                    manualMode.classList.remove('hidden');
                } else if (mode === 'reference') {
                    referenceMode.classList.remove('hidden');
                    if (typeof updateCorrectionsDisplay === 'function') {
                        updateCorrectionsDisplay();
                    }
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => App.init());