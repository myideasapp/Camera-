import React, { useState, useRef, useEffect } from 'react';
import { Clock, Expand, Maximize2, Rewind, Activity, BrainCircuit, AlertCircle, Info, X, Zap, ZapOff } from 'lucide-react';
import { TimeFrame, PlaybackState } from './types';
import { analyzeTimeFrame } from './services/geminiService';

const MAX_BUFFER_SIZE = 200; // Number of frames to keep
const CAPTURE_INTERVAL_MS = 100; // Capture every 100ms (10fps)

const App: React.FC = () => {
  // -- State --
  const [frames, setFrames] = useState<TimeFrame[]>([]);
  const [playbackState, setPlaybackState] = useState<PlaybackState>(PlaybackState.LIVE);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(-1);
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  
  // New States for UX
  const [showUI, setShowUI] = useState(true); // Toggle HUD visibility
  const [showHelp, setShowHelp] = useState(false); // Hindi Instructions
  
  // Torch State
  const [hasTorch, setHasTorch] = useState(false);
  const [isTorchOn, setIsTorchOn] = useState(false);

  // -- Refs --
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<number | null>(null);

  // -- Initialization --
  useEffect(() => {
    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { 
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'environment'
          }, 
          audio: false 
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }

        // Check for Torch capability
        const track = stream.getVideoTracks()[0];
        if (track) {
          // Use 'any' casting because 'torch' isn't strictly in all TS definitions yet
          const capabilities = track.getCapabilities() as any;
          if (capabilities.torch) {
            setHasTorch(true);
          }
        }

      } catch (err) {
        console.error("Camera Error:", err);
        setStreamError("Camera error. Kripya permission check karein.");
      }
    };

    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
           // Turn off torch before stopping if it was on
           if (isTorchOn) {
             track.applyConstraints({ advanced: [{ torch: false } as any] }).catch(() => {});
           }
           track.stop();
        });
      }
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
      }
    };
  }, []);

  // -- Buffering Loop --
  useEffect(() => {
    if (playbackState === PlaybackState.LIVE) {
      intervalRef.current = window.setInterval(() => {
        captureFrame();
      }, CAPTURE_INTERVAL_MS);
    } else {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [playbackState]);

  // Update current frame index when live
  useEffect(() => {
    if (playbackState === PlaybackState.LIVE) {
      setCurrentFrameIndex(frames.length - 1);
    }
  }, [frames.length, playbackState]);

  // -- Fullscreen Listener --
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullScreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // -- Helpers --

  const captureFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    if (video.readyState < 2) return;

    const scale = 0.5; 
    const w = video.videoWidth * scale;
    const h = video.videoHeight * scale;
    
    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, w, h);
      
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      
      const newFrame: TimeFrame = {
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        imageData: dataUrl
      };

      setFrames(prev => {
        const newBuffer = [...prev, newFrame];
        if (newBuffer.length > MAX_BUFFER_SIZE) {
          return newBuffer.slice(newBuffer.length - MAX_BUFFER_SIZE);
        }
        return newBuffer;
      });
    }
  };

  const toggleFullScreen = async () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      try {
        await containerRef.current.requestFullscreen();
      } catch (err) {
        console.error("Fullscreen denied", err);
      }
    } else {
      document.exitFullscreen();
    }
  };

  const toggleUI = () => {
    setShowUI(!showUI);
  };

  const toggleTorch = async () => {
    if (!videoRef.current || !videoRef.current.srcObject) return;
    
    const stream = videoRef.current.srcObject as MediaStream;
    const track = stream.getVideoTracks()[0];

    if (track) {
      try {
        await track.applyConstraints({
          advanced: [{ torch: !isTorchOn } as any]
        });
        setIsTorchOn(!isTorchOn);
      } catch (err) {
        console.error("Torch toggle failed", err);
      }
    }
  };

  const handleTimelineChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const index = parseInt(e.target.value, 10);
    setCurrentFrameIndex(index);
    
    if (index >= frames.length - 1) {
      setPlaybackState(PlaybackState.LIVE);
      setAnalysis(null);
    } else {
      setPlaybackState(PlaybackState.PAUSED);
    }
  };

  const handleAnalyze = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent hiding UI when clicking button
    if (currentFrameIndex < 0 || !frames[currentFrameIndex]) return;
    
    setIsAnalyzing(true);
    setAnalysis(null);
    
    const frame = frames[currentFrameIndex];
    const result = await analyzeTimeFrame(frame.imageData);
    
    setAnalysis(result);
    setIsAnalyzing(false);
  };

  const getTimeOffset = () => {
    if (frames.length === 0 || currentFrameIndex < 0) return "0.0s";
    const current = frames[currentFrameIndex]?.timestamp;
    const latest = frames[frames.length - 1]?.timestamp;
    if (!current || !latest) return "0.0s";
    
    const diff = (latest - current) / 1000;
    return `-${diff.toFixed(1)}s`;
  };

  return (
    <div ref={containerRef} className="relative w-full h-screen bg-black text-cyan-400 overflow-hidden flex flex-col select-none">
      
      {/* --- Hidden Canvas --- */}
      <canvas ref={canvasRef} className="hidden" />

      {/* --- Video / Display Area --- */}
      {/* Clicking here toggles UI for Pure Full Screen */}
      <div 
        className="relative flex-grow flex items-center justify-center bg-neutral-900 overflow-hidden cursor-pointer"
        onClick={toggleUI}
      >
        
        {/* 1. Live Video Layer */}
        <video 
          ref={videoRef}
          autoPlay 
          playsInline 
          muted
          className={`absolute w-full h-full object-cover transition-opacity duration-300 ${playbackState === PlaybackState.LIVE ? 'opacity-100' : 'opacity-0'}`}
        />

        {/* 2. Time Travel Layer (Image) */}
        {playbackState === PlaybackState.PAUSED && frames[currentFrameIndex] && (
          <div className="absolute w-full h-full animate-fadeIn">
            <img 
              src={frames[currentFrameIndex].imageData} 
              alt="Time Frame" 
              className="w-full h-full object-cover filter sepia-[.3] contrast-125"
            />
            <div className="absolute inset-0 scanlines opacity-30 pointer-events-none"></div>
            
            {showUI && (
              <div className="absolute top-4 left-4 bg-black/60 px-3 py-1 border border-cyan-500/50 text-xs rounded text-cyan-400 animate-pulse">
                PAST TIMELINE (BHOOTKAAL)
              </div>
            )}
          </div>
        )}

        {/* Error Display */}
        {streamError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-50 text-red-500">
            <AlertCircle size={48} className="mb-4" />
            <p className="text-xl text-center max-w-md px-6">{streamError}</p>
          </div>
        )}
        
        {/* Analysis Overlay - Always show if active, even if UI hidden, but allow close */}
        {(analysis || isAnalyzing) && (
          <div 
            className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 max-w-lg w-[90%] bg-black/80 border border-cyan-500/50 p-6 rounded-lg shadow-[0_0_50px_rgba(0,255,204,0.2)] backdrop-blur-sm z-30"
            onClick={(e) => e.stopPropagation()} 
          >
             <div className="flex items-center mb-3 text-cyan-300">
                <BrainCircuit className="mr-2" size={20} />
                <h3 className="text-sm font-bold font-['Orbitron'] tracking-wider uppercase">AI Vishleshan (Analysis)</h3>
             </div>
             {isAnalyzing ? (
               <div className="flex items-center space-x-2 text-cyan-500/70">
                 <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                 <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                 <div className="w-2 h-2 bg-cyan-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                 <span className="text-xs ml-2">ANALYZING...</span>
               </div>
             ) : (
               <div className="text-sm leading-relaxed text-gray-200 border-l-2 border-cyan-500 pl-3 max-h-60 overflow-y-auto">
                 {analysis}
               </div>
             )}
             <button 
               onClick={(e) => {
                 e.stopPropagation();
                 setAnalysis(null);
               }} 
               className="absolute top-2 right-2 text-gray-500 hover:text-white"
             >
               <X size={20} />
             </button>
          </div>
        )}

        {/* Hindi Help Modal */}
        {showHelp && (
           <div 
             className="absolute inset-0 bg-black/90 z-50 flex items-center justify-center p-4 backdrop-blur-sm"
             onClick={(e) => {
               e.stopPropagation();
               setShowHelp(false);
             }}
           >
             <div className="bg-neutral-900 border border-cyan-500 p-6 rounded-lg max-w-md w-full shadow-[0_0_30px_rgba(0,255,204,0.15)]">
                <div className="flex justify-between items-center mb-4 border-b border-cyan-800 pb-2">
                  <h2 className="text-xl font-['Orbitron'] text-cyan-400">Kaise Use Karein</h2>
                  <button onClick={() => setShowHelp(false)}><X size={24} /></button>
                </div>
                <ul className="space-y-4 text-sm text-gray-300 font-['JetBrains_Mono']">
                  <li className="flex items-start">
                    <Clock className="text-cyan-500 mr-3 mt-1 flex-shrink-0" size={16} />
                    <span><strong>Time Travel:</strong> Neeche slider ko peeche khichein purana scene dekhne ke liye.</span>
                  </li>
                  <li className="flex items-start">
                    <Zap className="text-yellow-400 mr-3 mt-1 flex-shrink-0" size={16} />
                    <span><strong>Torch (Light):</strong> Upar diye gaye bijli icon se light jalayein (Agar phone me support hai).</span>
                  </li>
                  <li className="flex items-start">
                    <BrainCircuit className="text-cyan-500 mr-3 mt-1 flex-shrink-0" size={16} />
                    <span><strong>AI Analysis:</strong> Jab video paused ho, "Analyze" button dabayein scene ke baare mein janne ke liye.</span>
                  </li>
                  <li className="flex items-start">
                    <Expand className="text-cyan-500 mr-3 mt-1 flex-shrink-0" size={16} />
                    <span><strong>Pure Full Screen:</strong> Video par screen par kahin bhi <strong>Tap</strong> karein buttons chupane ke liye.</span>
                  </li>
                </ul>
             </div>
           </div>
        )}

      </div>

      {/* --- HUD / Controls --- */}
      <div 
        className={`absolute bottom-0 w-full bg-gradient-to-t from-black via-black/90 to-transparent pt-12 pb-6 px-6 z-20 transition-transform duration-500 ${showUI ? 'translate-y-0' : 'translate-y-[150%]'}`}
        onClick={(e) => e.stopPropagation()} // Prevent clicking HUD from toggling UI
      >
        
        {/* Top Bar of HUD */}
        <div className="flex justify-between items-end mb-4">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 px-3 py-1 rounded-full border ${playbackState === PlaybackState.LIVE ? 'border-red-500/50 bg-red-500/10' : 'border-cyan-500/50 bg-cyan-500/10'}`}>
              <div className={`w-2 h-2 rounded-full ${playbackState === PlaybackState.LIVE ? 'bg-red-500 animate-pulse' : 'bg-cyan-500'}`}></div>
              <span className={`text-xs font-bold tracking-widest ${playbackState === PlaybackState.LIVE ? 'text-red-400' : 'text-cyan-400'}`}>
                {playbackState === PlaybackState.LIVE ? 'LIVE' : 'HISTORY'}
              </span>
            </div>
            
            <div className="hidden md:flex items-center text-cyan-600 text-xs font-mono">
              <Clock size={12} className="mr-1" />
              <span>OFFSET: {getTimeOffset()}</span>
            </div>
          </div>

          <div className="flex space-x-2">
             {/* Analyze Button */}
             {playbackState === PlaybackState.PAUSED && (
               <button 
                onClick={handleAnalyze}
                disabled={isAnalyzing}
                className="flex items-center space-x-2 px-4 py-2 bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500/30 rounded text-cyan-300 text-xs font-bold transition-all uppercase tracking-wider backdrop-blur-md disabled:opacity-50"
               >
                 <BrainCircuit size={14} />
                 <span>Analyze</span>
               </button>
             )}
             
             {/* Torch Button (Only shows if camera has torch) */}
             {hasTorch && (
               <button 
                 onClick={toggleTorch}
                 className={`p-2 rounded-full transition-colors ${isTorchOn ? 'text-yellow-400 bg-yellow-900/30 shadow-[0_0_15px_rgba(250,204,21,0.4)]' : 'text-cyan-400 hover:bg-white/10'}`}
                 title="Toggle Torch"
               >
                 {isTorchOn ? <Zap size={20} fill="currentColor" /> : <ZapOff size={20} />}
               </button>
             )}

             {/* Help Button */}
             <button 
               onClick={() => setShowHelp(true)}
               className="p-2 hover:bg-white/10 rounded-full text-cyan-400 transition-colors"
               title="Help"
             >
               <Info size={20} />
             </button>

             {/* Fullscreen Button */}
             <button 
               onClick={toggleFullScreen}
               className="p-2 hover:bg-white/10 rounded-full text-white transition-colors"
               title="Full Screen"
             >
               {isFullScreen ? <Expand size={20} /> : <Maximize2 size={20} />}
             </button>
          </div>
        </div>

        {/* Slider Container */}
        <div className="relative w-full h-12 flex items-center">
          <div className="absolute w-full h-8 flex items-center justify-between px-1 opacity-30 pointer-events-none">
             {[...Array(20)].map((_, i) => (
               <div key={i} className="w-px h-2 bg-cyan-500"></div>
             ))}
          </div>

          <Rewind size={16} className="text-cyan-600 mr-4 animate-pulse" />
          
          <input
            type="range"
            min="0"
            max={Math.max(0, frames.length - 1)}
            value={currentFrameIndex}
            onChange={handleTimelineChange}
            className="flex-grow z-10"
            step="1"
          />
          
          <Activity size={16} className={`ml-4 ${playbackState === PlaybackState.LIVE ? 'text-red-500 animate-pulse' : 'text-gray-600'}`} />
        </div>
        
        <div className="text-center mt-2">
           <p className="text-[10px] text-cyan-800 font-['Orbitron'] tracking-[0.3em]">CHRONOS v1.2 // TAP SCREEN TO HIDE UI</p>
        </div>
      </div>
    </div>
  );
};

export default App;