class MultitrackEngine {
    constructor(onProgress, onEnd, onMeters) {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.tracks = []; 
        this.masterGain = this.ctx.createGain();
        this.masterGain.connect(this.ctx.destination);
        
        this.isPlaying = false;
        this.startTime = 0;
        this.pauseTime = 0;
        this.duration = 0;
        
        this.onProgress = onProgress;
        this.onEnd = onEnd;
        this.onMeters = onMeters;
        this.progressInterval = null;
    }

    async loadSong(songDef, onLoadingProgress) {
        this.stop();
        this.tracks = [];
        this.duration = 0;
        
        let loadedCount = 0;
        const total = songDef.tracks.length;
        
        for (const trackDef of songDef.tracks) {
            try {
                const response = await fetch(trackDef.url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                
                if (audioBuffer.duration > this.duration) {
                    this.duration = audioBuffer.duration;
                }
                
                const analyser = this.ctx.createAnalyser();
                analyser.fftSize = 256;

                const gainNode = this.ctx.createGain();
                gainNode.connect(analyser);
                analyser.connect(this.masterGain);
                
                this.tracks.push({
                    id: trackDef.id,
                    name: trackDef.name,
                    buffer: audioBuffer,
                    source: null,
                    gainNode: gainNode,
                    analyser: analyser,
                    meterLevel: 0,
                    volume: 0.8,
                    mute: false,
                    solo: false
                });
                
                loadedCount++;
                if(onLoadingProgress) onLoadingProgress(loadedCount / total);
            } catch (err) {
                console.error("Error loading track", trackDef, err);
            }
        }
        
        this.updateMuteSolo();
    }

    _createSources() {
        this.tracks.forEach(track => {
            if (track.source) {
                try { track.source.disconnect(); } catch(e){}
            }
            track.source = this.ctx.createBufferSource();
            track.source.buffer = track.buffer;
            track.source.connect(track.gainNode);
        });
    }

    play() {
        if (this.isPlaying) return;
        if (this.ctx.state === 'suspended') this.ctx.resume();
        
        this._createSources();
        this.startTime = this.ctx.currentTime - this.pauseTime;
        
        this.tracks.forEach(track => {
            track.source.start(0, this.pauseTime);
        });
        
        this.isPlaying = true;
        this._updateProgressLoop();
    }

    pause() {
        if (!this.isPlaying) return;
        
        this.tracks.forEach(track => {
            if(track.source) {
                try { track.source.stop(); } catch(e){}
            }
        });
        
        this.pauseTime = this.ctx.currentTime - this.startTime;
        this.isPlaying = false;
        cancelAnimationFrame(this.progressInterval);
    }

    stop() {
        if (this.isPlaying) {
            this.tracks.forEach(track => {
                if(track.source) {
                    try { track.source.stop(); } catch(e){}
                }
            });
        }
        this.pauseTime = 0;
        this.isPlaying = false;
        cancelAnimationFrame(this.progressInterval);
        if(this.onProgress) this.onProgress(0);
    }

    seek(time) {
        const wasPlaying = this.isPlaying;
        if (wasPlaying) this.pause();
        
        this.pauseTime = Math.max(0, Math.min(time, this.duration));
        
        if (this.onProgress) this.onProgress(this.pauseTime);
        
        if (wasPlaying) this.play();
    }

    setVolume(trackId, volume) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.volume = Math.max(0, Math.min(volume, 1));
            this.updateMuteSolo();
        }
    }

    setMute(trackId, mute) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.mute = mute;
            this.updateMuteSolo();
        }
    }

    setSolo(trackId, solo) {
        const track = this.tracks.find(t => t.id === trackId);
        if (track) {
            track.solo = solo;
            this.updateMuteSolo();
        }
    }

    updateMuteSolo() {
        const anySolo = this.tracks.some(t => t.solo);
        
        this.tracks.forEach(track => {
            let effectiveVolume = track.volume;
            
            if (anySolo) {
                if (!track.solo) effectiveVolume = 0;
            } else {
                if (track.mute) effectiveVolume = 0;
            }
            
            if (this.ctx.state !== 'closed') {
                track.gainNode.gain.setTargetAtTime(effectiveVolume, this.ctx.currentTime, 0.05);
            }
        });
    }

    _updateProgressLoop() {
        if (!this.isPlaying) return;
        
        const currentTime = this.ctx.currentTime - this.startTime;
        
        if (currentTime >= this.duration && this.duration > 0) {
            this.stop();
            if (this.onEnd) this.onEnd();
        } else {
            if (this.onProgress) this.onProgress(currentTime);
            
            if (this.onMeters) {
                const levels = this.tracks.map(track => {
                    const dataArray = new Uint8Array(track.analyser.frequencyBinCount);
                    track.analyser.getByteTimeDomainData(dataArray);
                    let peak = 0;
                    for(let i=0; i<dataArray.length; i++) {
                        const val = Math.abs((dataArray[i] - 128) / 128);
                        if (val > peak) peak = val;
                    }
                    track.meterLevel = Math.max((track.meterLevel || 0) - 0.05, peak);
                    return track.meterLevel;
                });
                this.onMeters(levels);
            }

            this.progressInterval = requestAnimationFrame(() => this._updateProgressLoop());
        }
    }
}

const { createApp, ref, computed, onMounted, watch } = Vue;

const IconPlay = { template: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>` };
const IconPause = { template: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>` };
const IconStop = { template: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>` };
const IconSkipBack = { template: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5"></line></svg>` };
const IconSkipForward = { template: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19"></line></svg>` };
const IconMenu = { template: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>` };
const IconClose = { template: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>` };
const IconBack = { template: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>` };
const IconChevronRight = { template: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>` };

const formatTime = (seconds) => {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const app = createApp({
    components: { IconPlay, IconPause, IconStop, IconSkipBack, IconSkipForward, IconMenu, IconClose, IconBack, IconChevronRight },
    setup() {
        const playlistsList = ref([]);
        const currentSetlist = ref(null);
        const currentSongIndex = ref(0);
        const selectedPlaylistFile = ref('');
        
        const loading = ref(false);
        const loadingProgress = ref(0);
        
        const isPlaying = ref(false);
        const currentTime = ref(0);
        const duration = ref(0);
        
        const engineTracks = ref([]);

        let engine = null;
        
        const autoNext = ref(localStorage.getItem('stemsy_autoNext') === 'true');
        const showVuMeters = ref(localStorage.getItem('stemsy_showVuMeters') !== 'false');
        
        watch(autoNext, (val) => {
            localStorage.setItem('stemsy_autoNext', val);
        });
        
        watch(showVuMeters, (val) => {
            localStorage.setItem('stemsy_showVuMeters', val);
        });

        const showMenu = ref(false);
        const activeTab = ref('main');
        const trackSettings = ref({});

        const openMenu = (tab = 'main') => {
            activeTab.value = tab;
            showMenu.value = true;
        };

        const initEngine = () => {
            if (!engine) {
                engine = new MultitrackEngine(
                    (time) => {
                        currentTime.value = time;
                    },
                    () => {
                        isPlaying.value = false;
                        currentTime.value = 0;
                        
                        if (autoNext.value && currentSetlist.value && currentSongIndex.value < currentSetlist.value.songs.length - 1) {
                            loadSong(currentSongIndex.value + 1).then(() => {
                                if(engine) {
                                    engine.play();
                                    isPlaying.value = true;
                                }
                            });
                        }
                    },
                    (levels) => {
                        if (!showVuMeters.value) return;
                        engineTracks.value.forEach((track, i) => {
                            track.level = levels[i];
                        });
                    }
                );
            }
        };

        const loadIndex = async () => {
            try {
                const res = await fetch('playlists/index.json');
                if(!res.ok) throw new Error("Index playlists non trouvé");
                const data = await res.json();
                playlistsList.value = data;
                
                if (data.length > 0) {
                    selectedPlaylistFile.value = data[0].file;
                    await loadPlaylist(data[0].file);
                }
            } catch(e) {
                console.error("Failed to load index", e);
                // Fallback to default
                playlistsList.value = [{ id: "default", name: "Setlist par défaut", file: "default.json" }];
                selectedPlaylistFile.value = "default.json";
                await loadPlaylist("default.json");
            }
        };

        const loadPlaylist = async (file) => {
            try {
                stop();
                loading.value = true;
                const res = await fetch(`playlists/${file}`);
                if(!res.ok) throw new Error("Fichier playlist non trouvé");
                const data = await res.json();
                
                // Réinitialiser les réglages conservés lors d'un changement de playlist
                trackSettings.value = {};
                
                currentSetlist.value = data;
                if (data.songs && data.songs.length > 0) {
                    await loadSong(0);
                } else {
                    engineTracks.value = [];
                    currentSongIndex.value = 0;
                    loading.value = false;
                }
            } catch(e) {
                console.error("Failed to load playlist", e);
                loading.value = false;
            }
        };

        const selectPlaylist = (file) => {
            selectedPlaylistFile.value = file;
            loadPlaylist(file);
            activeTab.value = 'songs'; // Basculer sur les morceaux après choix de la setlist
        };

        const selectSong = (index) => {
            loadSong(index);
            showMenu.value = false;
        };

        const loadSong = async (index) => {
            if (!currentSetlist.value || index < 0 || index >= currentSetlist.value.songs.length) return;
            
            initEngine();
            const song = currentSetlist.value.songs[index];
            currentSongIndex.value = index;
            
            loading.value = true;
            loadingProgress.value = 0;
            isPlaying.value = false;
            currentTime.value = 0;
            duration.value = 0;
            engineTracks.value = [];
            
            await engine.loadSong(song, (progress) => {
                loadingProgress.value = Math.round(progress * 100);
            });
            
            duration.value = engine.duration;
            
            // Appliquer les réglages sauvegardés s'ils existent
            engine.tracks.forEach(t => {
                if (trackSettings.value[t.id]) {
                    t.volume = trackSettings.value[t.id].volume;
                    t.mute = trackSettings.value[t.id].mute;
                    t.solo = trackSettings.value[t.id].solo;
                }
            });
            engine.updateMuteSolo();
            
            engineTracks.value = engine.tracks.map(t => ({
                id: t.id,
                name: t.name,
                volume: t.volume,
                mute: t.mute,
                solo: t.solo,
                level: 0
            }));
            
            loading.value = false;
        };

        const togglePlay = () => {
            if (loading.value || !engine) return;
            if (isPlaying.value) {
                engine.pause();
                isPlaying.value = false;
            } else {
                engine.play();
                isPlaying.value = true;
            }
        };

        const stop = () => {
            if (engine) engine.stop();
            isPlaying.value = false;
            currentTime.value = 0;
        };

        const prevSong = () => {
            if (!engine) return;
            if (currentTime.value > 3 || currentSongIndex.value === 0) {
                engine.seek(0);
            } else {
                loadSong(currentSongIndex.value - 1);
            }
        };

        const nextSong = () => {
            if (currentSetlist.value && currentSongIndex.value < currentSetlist.value.songs.length - 1) {
                loadSong(currentSongIndex.value + 1);
            }
        };

        const handleSeek = (e) => {
            if (!engine || loading.value) return;
            const rect = e.currentTarget.getBoundingClientRect();
            const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            const percentage = x / rect.width;
            const targetTime = percentage * duration.value;
            engine.seek(targetTime);
            currentTime.value = targetTime;
        };

        const saveTrackSettings = (track) => {
            trackSettings.value[track.id] = {
                volume: track.volume,
                mute: track.mute,
                solo: track.solo
            };
        };

        const setVolume = (id, vol) => {
            const track = engineTracks.value.find(t => t.id === id);
            if (track) {
                const numVol = parseFloat(vol);
                track.volume = numVol;
                saveTrackSettings(track);
                if(engine) engine.setVolume(id, numVol);
            }
        };

        const toggleMute = (id) => {
            const track = engineTracks.value.find(t => t.id === id);
            if (track) {
                track.mute = !track.mute;
                saveTrackSettings(track);
                if(engine) engine.setMute(id, track.mute);
            }
        };

        const toggleSolo = (id) => {
            const track = engineTracks.value.find(t => t.id === id);
            if (track) {
                track.solo = !track.solo;
                saveTrackSettings(track);
                if(engine) engine.setSolo(id, track.solo);
            }
        };

        let audioUnlocked = false;
        const unlockAudio = () => {
            if (audioUnlocked) return;
            audioUnlocked = true;
            
            // Bypass iOS Silent Mode hardware switch by playing a dummy audio tag
            const audio = document.createElement('audio');
            audio.src = "data:audio/wav;base64,UklGRiQAAGFXQVZFZm10IBAAAAABAAEAwF0AAIC7AAACABAAZGF0YQAAAAA=";
            audio.playsInline = true;
            audio.volume = 0;
            
            const playPromise = audio.play();
            if (playPromise !== undefined) {
                playPromise.catch(e => console.warn("Audio unlock prevented by browser", e));
            }
        };

        let wakeLock = null;
        const requestWakeLock = async () => {
            if ('wakeLock' in navigator) {
                try {
                    wakeLock = await navigator.wakeLock.request('screen');
                    console.log('Wake Lock activé : écran maintenu allumé');
                } catch (err) {
                    console.warn(`Wake Lock erreur: ${err.message}`);
                }
            }
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                requestWakeLock();
            }
        };

        onMounted(() => {
            loadIndex();

            const initInteractions = () => {
                unlockAudio();
                requestWakeLock();
                document.removeEventListener('click', initInteractions);
                document.removeEventListener('touchstart', initInteractions);
            };

            document.addEventListener('click', initInteractions);
            document.addEventListener('touchstart', initInteractions);
            document.addEventListener('visibilitychange', handleVisibilityChange);
        });

        const currentSong = computed(() => {
            return currentSetlist.value ? currentSetlist.value.songs[currentSongIndex.value] : null;
        });

        const progressPercent = computed(() => {
            if (duration.value === 0) return 0;
            return (currentTime.value / duration.value) * 100;
        });

        return {
            loading,
            loadingProgress,
            isPlaying,
            currentTime,
            duration,
            progressPercent,
            currentSong,
            engineTracks,
            togglePlay,
            stop,
            prevSong,
            nextSong,
            handleSeek,
            setVolume,
            toggleMute,
            toggleSolo,
            formatTime,
            playlistsList,
            selectedPlaylistFile,
            selectPlaylist,
            selectSong,
            currentSetlist,
            currentSongIndex,
            loadSong,
            autoNext,
            showVuMeters,
            showMenu,
            activeTab,
            openMenu
        };
    },
    template: `
        <div class="flex-1 flex flex-col h-full bg-daw-bg">
            <header class="bg-daw-panel border-b border-daw-border p-3 shadow-md z-10 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div class="flex items-center gap-4 w-full sm:w-auto justify-between sm:justify-start">
                    <div class="flex items-center gap-2 md:gap-4">
                        <button @click="openMenu('main')" class="p-2 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors">
                            <IconMenu />
                        </button>
                        <img src="icons/logo.svg" alt="Stemsy Logo" class="h-8 md:h-10 object-contain" />
                    </div>
                </div>
                
                <div class="flex flex-col items-center sm:items-end w-full sm:w-auto mt-2 sm:mt-0">
                    <button @click="openMenu('songs')" class="text-daw-accent hover:text-white font-bold text-lg md:text-xl truncate max-w-[250px] sm:max-w-xs transition-colors flex items-center gap-2">
                        <span v-if="currentSong">{{ currentSong.title }}</span>
                        <span v-else>Sélectionner un morceau</span>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                    </button>
                    <div class="text-xs text-gray-500 mt-1" v-if="currentSetlist">
                        Piste {{ currentSongIndex + 1 }} sur {{ currentSetlist.songs.length }}
                    </div>
                </div>
            </header>

            <div v-if="loading" class="absolute inset-0 z-50 bg-daw-bg/90 backdrop-blur-sm flex flex-col items-center justify-center">
                <img src="icons/logo.svg" alt="Stemsy Logo" class="w-36 h-36 md:w-48 md:h-48 object-contain mb-8 animate-pulse drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
                <div class="w-12 h-12 border-4 border-gray-600 border-t-daw-accent rounded-full animate-spin mb-4"></div>
                <div class="text-xl font-bold text-gray-200">Chargement des stems... {{ loadingProgress }}%</div>
            </div>

            <main class="flex-1 overflow-y-auto p-4 md:p-8 space-y-4">
                <div v-if="!loading && engineTracks.length === 0" class="text-center text-gray-500 mt-10 p-8 border border-dashed border-gray-700 rounded-lg">
                    <p class="text-lg mb-2">Aucune piste chargée.</p>
                    <p class="text-sm">Veuillez vérifier votre fichier <code class="bg-gray-800 px-1 rounded">playlists/default.json</code></p>
                </div>
                
                <div v-for="track in engineTracks" :key="track.id" class="bg-daw-panel border border-daw-border rounded-lg p-3 md:p-4 flex flex-col md:flex-row items-center gap-4 hover:border-gray-500 transition-colors">
                    
                    <div class="w-full md:w-48 font-medium truncate text-center md:text-left text-lg text-gray-200">
                        {{ track.name }}
                    </div>

                    <div class="flex gap-2 w-full md:w-auto justify-center">
                        <button @click="toggleMute(track.id)" :class="['px-4 py-2 font-bold rounded shadow-sm text-sm uppercase transition-colors', track.mute ? 'bg-red-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600']">
                            M
                        </button>
                        <button @click="toggleSolo(track.id)" :class="['px-4 py-2 font-bold rounded shadow-sm text-sm uppercase transition-colors', track.solo ? 'bg-yellow-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600']">
                            S
                        </button>
                    </div>

                    <div class="flex-1 flex items-center gap-4 w-full px-2">
                        <span class="text-xs text-gray-500 font-mono w-8 text-right">0%</span>
                        <input type="range" min="0" max="1" step="0.01" :value="track.volume" @input="e => setVolume(track.id, e.target.value)" class="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer">
                        <span class="text-xs text-gray-500 font-mono w-8">100%</span>
                    </div>

                    <div v-if="showVuMeters" class="relative w-3 md:w-4 h-12 md:h-16 bg-gray-900 rounded flex-shrink-0 led-mask overflow-hidden mx-auto hidden sm:block">
                        <div class="absolute inset-0 led-bar opacity-20"></div>
                        <div class="absolute bottom-0 left-0 w-full overflow-hidden transition-all duration-75" :style="{ height: Math.min(100, track.level * 130) + '%' }">
                            <div class="absolute bottom-0 left-0 w-full h-12 md:h-16 led-bar"></div>
                        </div>
                    </div>
                </div>
            </main>

            <footer class="bg-daw-panel border-t border-daw-border p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.3)] z-10 flex flex-col gap-4">
                
                <div class="w-full flex items-center px-2">
                    <div class="flex-1 h-8 bg-gray-800 rounded flex items-center px-1 cursor-pointer relative group" @click="handleSeek">
                        <div class="absolute left-0 top-0 bottom-0 bg-daw-accent/20 rounded pointer-events-none" :style="{ width: progressPercent + '%' }"></div>
                        <div class="w-full h-2 bg-gray-700 rounded-full pointer-events-none overflow-hidden">
                            <div class="h-full bg-daw-accent" :style="{ width: progressPercent + '%' }"></div>
                        </div>
                        <div class="absolute w-3 h-6 bg-gray-300 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none transform -translate-x-1.5" :style="{ left: progressPercent + '%' }"></div>
                    </div>
                </div>

                <div class="flex flex-col md:flex-row justify-between items-center gap-4 md:gap-6 px-2 md:px-4">
                    
                    <div class="flex-1 text-center md:text-left truncate w-full flex flex-col justify-center">
                        <h2 class="text-2xl md:text-3xl font-bold text-gray-100 truncate" v-if="currentSong">
                            {{ currentSong.title }}
                        </h2>
                        <div class="text-sm text-gray-400 truncate mt-1" v-if="currentSong && currentSong.artist">
                            {{ currentSong.artist }}
                        </div>
                    </div>

                    <div class="flex justify-center items-center gap-4 sm:gap-6 flex-1">
                        <button @click="prevSong" class="p-3 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors">
                            <IconSkipBack />
                        </button>
                        
                        <button @click="stop" class="p-3 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors">
                            <IconStop />
                        </button>
                        
                        <button @click="togglePlay" class="p-5 bg-daw-accent text-white rounded-full hover:bg-blue-400 shadow-[0_0_15px_rgba(59,130,246,0.5)] transition-transform transform hover:scale-105 active:scale-95">
                            <IconPause v-if="isPlaying" />
                            <IconPlay v-else />
                        </button>
                        
                        <button @click="nextSong" class="p-3 text-gray-400 hover:text-white rounded-full hover:bg-gray-700 transition-colors">
                            <IconSkipForward />
                        </button>
                    </div>
                    
                    <div class="flex-1 text-center md:text-right w-full font-mono text-3xl md:text-4xl text-daw-accent font-bold tracking-wider">
                        {{ formatTime(currentTime) }} <span class="text-gray-500 text-xl md:text-2xl">/ {{ formatTime(duration) }}</span>
                    </div>
                </div>
            </footer>

            <!-- Menu Overlay -->
            <div v-if="showMenu" class="absolute inset-0 z-[100] flex">
                <div class="absolute inset-0 bg-black/60 backdrop-blur-sm" @click="showMenu = false"></div>
                
                <div class="relative w-80 max-w-[80%] h-full bg-daw-panel border-r border-daw-border flex flex-col shadow-2xl transform transition-transform duration-300">
                    <div class="flex items-center justify-between p-4 border-b border-daw-border bg-gray-900">
                        <div class="flex items-center gap-3">
                            <button v-if="activeTab !== 'main'" @click="activeTab = 'main'" class="p-1.5 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors">
                                <IconBack />
                            </button>
                            <h2 class="text-lg font-bold text-gray-100 flex-1 truncate">
                                <template v-if="activeTab === 'main'">Menu</template>
                                <template v-else-if="activeTab === 'songs'">Morceaux</template>
                                <template v-else-if="activeTab === 'playlists'">Setlists</template>
                                <template v-else-if="activeTab === 'options'">Options</template>
                                <template v-else-if="activeTab === 'about'">À propos</template>
                            </h2>
                        </div>
                        <button @click="showMenu = false" class="p-2 text-gray-400 hover:text-white rounded hover:bg-gray-700 transition-colors">
                            <IconClose />
                        </button>
                    </div>

                    <div class="flex-1 overflow-y-auto p-4 sm:p-6">
                        <!-- Main Menu Listing -->
                        <div v-if="activeTab === 'main'" class="space-y-3">
                            <button @click="activeTab = 'songs'" class="w-full text-left p-4 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-500 font-bold text-lg transition-all flex items-center justify-between">
                                Morceaux
                                <IconChevronRight class="text-gray-500" />
                            </button>
                            <button @click="activeTab = 'playlists'" class="w-full text-left p-4 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-500 font-bold text-lg transition-all flex items-center justify-between">
                                Setlists
                                <IconChevronRight class="text-gray-500" />
                            </button>
                            <button @click="activeTab = 'options'" class="w-full text-left p-4 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-500 font-bold text-lg transition-all flex items-center justify-between">
                                Options
                                <IconChevronRight class="text-gray-500" />
                            </button>
                            <button @click="activeTab = 'about'" class="w-full text-left p-4 rounded-lg bg-gray-800 border border-gray-700 text-gray-200 hover:bg-gray-700 hover:border-gray-500 font-bold text-lg transition-all flex items-center justify-between">
                                À propos
                                <IconChevronRight class="text-gray-500" />
                            </button>
                        </div>

                        <!-- Sub Views -->
                        <div v-if="activeTab === 'songs'" class="space-y-2">
                            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4" v-if="currentSetlist">{{ currentSetlist.name }}</h3>
                            <div v-if="!currentSetlist" class="text-gray-500 text-sm">Aucune setlist chargée.</div>
                            
                            <button 
                                v-for="(song, idx) in currentSetlist?.songs || []" 
                                :key="song.id" 
                                @click="selectSong(idx)"
                                :class="[
                                    'w-full text-left p-3 rounded-lg border transition-all duration-200 flex flex-col', 
                                    currentSongIndex === idx 
                                        ? 'bg-daw-accent/20 border-daw-accent text-white' 
                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-500'
                                ]"
                            >
                                <div class="font-bold text-sm">{{ idx + 1 }}. {{ song.title }}</div>
                                <div class="text-xs text-gray-500 mt-1" v-if="song.artist">{{ song.artist }}</div>
                            </button>
                        </div>

                        <div v-if="activeTab === 'playlists'" class="space-y-3">
                            <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider mb-4">Choisir une Setlist</h3>
                            <button 
                                v-for="pl in playlistsList" 
                                :key="pl.id" 
                                @click="selectPlaylist(pl.file)"
                                :class="[
                                    'w-full text-left p-4 rounded-lg border transition-all duration-200', 
                                    selectedPlaylistFile === pl.file 
                                        ? 'bg-daw-accent/10 border-daw-accent text-white' 
                                        : 'bg-gray-800 border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-500'
                                ]"
                            >
                                <div class="font-bold text-lg">{{ pl.name }}</div>
                            </button>
                        </div>

                        <div v-if="activeTab === 'options'" class="space-y-8">
                            <div class="space-y-4">
                                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Lecture</h3>
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" v-model="autoNext" class="w-5 h-5 rounded bg-gray-800 border-gray-600 text-daw-accent focus:ring-daw-accent cursor-pointer">
                                    <span class="text-gray-300 select-none text-sm">Enchaîner automatiquement</span>
                                </label>
                            </div>
                            
                            <div class="space-y-4">
                                <h3 class="text-xs font-bold text-gray-500 uppercase tracking-wider">Interface</h3>
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" v-model="showVuMeters" class="w-5 h-5 rounded bg-gray-800 border-gray-600 text-daw-accent focus:ring-daw-accent cursor-pointer">
                                    <span class="text-gray-300 select-none text-sm">Afficher les Vu-mètres</span>
                                </label>
                            </div>
                        </div>

                        <div v-if="activeTab === 'about'" class="space-y-4 text-gray-300 text-sm leading-relaxed">
                            <div class="flex flex-col items-center justify-center mb-6 mt-2">
                                <img src="icons/logo.svg" alt="Stemsy Logo" class="w-40 h-40 object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.3)]" />
                            </div>
                            <p><strong>Stemsy</strong> est un lecteur audio multipiste conçu pour les musiciens en répétition et en live.</p>
                            <p>Il utilise l'API <em>Web Audio</em> pour garantir une synchronisation parfaite au bit près entre toutes les pistes (clic, basse, séquences, etc.).</p>
                            <p>L'interface de type "DAW" permet de gérer les volumes, muter ou isoler des pistes individuellement, afin de s'adapter aux besoins de chaque musicien (ex: couper la batterie pour faire jouer le vrai batteur).</p>
                            <div class="mt-8 pt-4 border-t border-gray-700 text-center text-gray-500 text-xs">
                                Version 1.0<br>
                                Conçu comme PWA
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `
});

app.mount('#app');