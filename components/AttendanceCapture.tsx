import React, { useState, useRef, useEffect } from 'react';
import { SchoolData, Attendance, Student } from '../types';
import { dbService } from '../services/dbService';
import { useDialog } from '../DialogContext';
import { Camera, CheckCircle, XCircle, User, SwitchCamera, Loader2, Search, RefreshCw } from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';

interface AttendanceCaptureProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const AttendanceCapture: React.FC<AttendanceCaptureProps> = ({ data, updateData }) => {
  const { showAlert } = useDialog();
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  
  // Auto-detected state
  const [detectedStudentId, setDetectedStudentId] = useState<string | null>(null);
  const [detectedClassId, setDetectedClassId] = useState<string | null>(null);

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setCapturedImage(null);
      setShowConfirmModal(false);
      setDetectedStudentId(null);
      setDetectedClassId(null);
      setIsProcessing(false);
      setIsClosing(false);
      stopCamera();
    }, 400);
  };

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  // Load Models
  useEffect(() => {
    const loadModels = async () => {
      const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
      try {
        await Promise.all([
          faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        ]);
        setModelsLoaded(true);
      } catch (err) {
        console.error("Error loading face-api models", err);
        showAlert('Erro', "Erro ao carregar modelos de reconhecimento facial. Verifique sua conexão.", 'error');
      }
    };
    loadModels();
  }, []);

  // Start Camera
  const startCamera = async () => {
    try {
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      if (videoRef.current && videoRef.current.srcObject) {
        const oldStream = videoRef.current.srcObject as MediaStream;
        oldStream.getTracks().forEach(track => track.stop());
        videoRef.current.srcObject = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: facingMode } 
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
            await videoRef.current.play();
        } catch (e) {
            console.error("Error playing video", e);
        }
      }
      setCameraActive(true);
      setIsProcessing(false);
    } catch (err) {
      console.error("Error accessing camera:", err);
      showAlert('Erro', "Erro ao acessar a câmera. Verifique as permissões.", 'error');
    }
  };

  // Attach stream to video when active
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(e => console.error("Error playing video", e));
    }
  }, [cameraActive]);

  // Stop Camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  const stopCamera = () => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // Restart camera when facing mode changes
  useEffect(() => {
    if (cameraActive) {
      startCamera();
    }
  }, [facingMode]);

  // Face Detection Loop
  useEffect(() => {
    if (cameraActive && modelsLoaded && videoRef.current) {
      const detectFace = async () => {
        if (!videoRef.current || videoRef.current.paused || videoRef.current.ended || isProcessing || showConfirmModal) return;

        try {
          const detections = await faceapi.detectAllFaces(videoRef.current, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks()
            .withFaceDescriptors();

          if (detections.length > 0) {
            // Find best match
            const bestMatch = findBestMatch(detections[0].descriptor);
            
            if (bestMatch) {
              // Found a student!
              setIsProcessing(true);
              capturePhoto(bestMatch.studentId, bestMatch.classId);
            }
          }
        } catch (e) {
          console.error("Detection error", e);
        }
      };

      intervalRef.current = setInterval(detectFace, 1000); // Check every 1s
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [cameraActive, modelsLoaded, isProcessing, showConfirmModal, data.students]);

  const findBestMatch = (descriptor: Float32Array) => {
    let bestDistance = 0.6; // Threshold
    let bestStudentId = null;
    let bestClassId = null;

    // Iterate through all active students who have a face descriptor
    for (const student of data.students) {
      if (student.status !== 'active' || !student.faceDescriptor) continue;
      
      const studentDescriptor = new Float32Array(student.faceDescriptor);
      const distance = faceapi.euclideanDistance(descriptor, studentDescriptor);

      if (distance < bestDistance) {
        bestDistance = distance;
        bestStudentId = student.id;
        bestClassId = student.classId;
      }
    }

    if (bestStudentId && bestClassId) {
      return { studentId: bestStudentId, classId: bestClassId };
    }
    return null;
  };

  const capturePhoto = (studentId: string, classId: string) => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg');
        
        setCapturedImage(imageData);
        setDetectedStudentId(studentId);
        setDetectedClassId(classId);
        setShowConfirmModal(true);
      }
    }
  };

  const confirmPresence = () => {
    if (!detectedStudentId || !detectedClassId || !capturedImage) return;

    // Check if already present for THIS class within a 1-hour window
    // (Allows multiple presences per day if lessons are at different times)
    const now = new Date();
    const alreadyPresent = data.attendance.some(a => {
      if (a.studentId !== detectedStudentId || a.classId !== detectedClassId) return false;
      const attDate = new Date(a.date);
      const isSameDay = attDate.toDateString() === now.toDateString();
      const diffMs = Math.abs(now.getTime() - attDate.getTime());
      return isSameDay && diffMs < (5 * 60 * 1000); // Intervalo de 5 minutos
    });

    if (alreadyPresent) {
      showAlert('Atenção', "Aluno já marcou presença hoje!", 'warning');
      cancelCapture();
      return;
    }

    const newAttendance: Attendance = {
      id: crypto.randomUUID(),
      studentId: detectedStudentId,
      classId: detectedClassId,
      date: new Date().toISOString(),
      photo: capturedImage,
      type: 'presence',
      verified: true
    };

    const updatedAttendance = [...(data.attendance || []), newAttendance];
    updateData({ attendance: updatedAttendance });
    dbService.saveData({ ...data, attendance: updatedAttendance });

    // Reset for next student
    setCapturedImage(null);
    setShowConfirmModal(false);
    setDetectedStudentId(null);
    setDetectedClassId(null);
    setIsProcessing(false);
    closeModal();
    showAlert('Sucesso', "Presença confirmada com sucesso!", 'success');
  };

  const cancelCapture = () => {
    closeModal();
  };

  const detectedStudent = data.students.find(s => s.id === detectedStudentId);
  const detectedClass = data.classes.find(c => c.id === detectedClassId);

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-300 pb-20 px-4">
      <header className="text-center">
        <h2 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">Registro de Presença</h2>
        <p className="text-slate-500 text-sm md:text-base font-medium">Posicione o rosto para identificação automática.</p>
      </header>

      <div className="flex flex-col items-center gap-6">
        {/* Camera View Container */}
        <div className="w-full max-w-md space-y-4">
          <div className="bg-black rounded-2xl overflow-hidden relative aspect-[3/4] shadow-2xl flex flex-col border-4 border-white">
            {cameraActive ? (
              <>
                <video 
                  ref={videoRef} 
                  autoPlay 
                  playsInline 
                  muted
                  className="w-full h-full object-cover flex-1"
                />
                <canvas ref={canvasRef} className="hidden" />
                
                {/* Overlay UI */}
                <div className="absolute inset-0 pointer-events-none border-[3px] border-white/20 m-6 md:m-10 rounded-2xl flex flex-col items-center justify-center">
                  <div className="w-40 h-40 md:w-56 md:h-56 border-2 border-dashed border-white/40 rounded-full mb-4 animate-pulse"></div>
                  <p className="text-white/90 text-xs md:text-sm font-bold bg-black/50 px-4 py-1.5 rounded-full backdrop-blur-md">
                    Aguardando rosto...
                  </p>
                </div>

                {/* Switch Camera Button (Floating) */}
                <button 
                  onClick={switchCamera}
                  className="absolute bottom-4 right-4 p-3 bg-white/20 hover:bg-white/30 text-white rounded-full backdrop-blur-md transition-all active:scale-90"
                  title="Alternar Câmera"
                >
                  <SwitchCamera size={20} />
                </button>
              </>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-8 text-center bg-slate-50">
                <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                  <Camera size={40} className="opacity-20" />
                </div>
                <p className="text-sm font-medium">A câmera está desligada.</p>
                <p className="text-xs mt-1">Clique no botão abaixo para iniciar.</p>
              </div>
            )}
          </div>

          {/* Main Action Button */}
          {!cameraActive ? (
            <button 
              onClick={startCamera}
              disabled={!modelsLoaded}
              className="w-full py-5 bg-emerald-600 text-white rounded-2xl font-black text-xl hover:bg-emerald-700 shadow-xl shadow-emerald-100 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
            >
              <CheckCircle size={28} /> Marcar Presença
            </button>
          ) : (
            <button 
              onClick={stopCamera}
              className="w-full py-5 bg-red-500 text-white rounded-2xl font-black text-xl hover:bg-red-600 shadow-xl shadow-red-100 flex items-center justify-center gap-3 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <XCircle size={28} /> Cancelar
            </button>
          )}
        </div>

        {/* System Status (Minimalist) */}
        {!cameraActive && (
          <div className="flex flex-wrap justify-center gap-4 text-[10px] font-bold uppercase tracking-widest text-slate-400">
            <div className="flex items-center gap-1.5">
              <div className={`w-2 h-2 rounded-full ${modelsLoaded ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`}></div>
              {modelsLoaded ? 'IA Pronta' : 'Carregando IA'}
            </div>
            <div className="flex items-center gap-1.5">
              <User size={12} />
              {data.students.filter(s => s.faceDescriptor).length} Faces Cadastradas
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && capturedImage && detectedStudent && (
        <div className={`fixed inset-0 bg-black/95 backdrop-blur-md z-50 flex items-center justify-center p-4 transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl transition-all duration-400 relative ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-8 text-center space-y-6">
              <div className="space-y-1">
                <h3 className="text-2xl font-black text-slate-800">Identificado!</h3>
                <p className="text-slate-500 text-sm font-medium">Confirmar presença para:</p>
              </div>
              
              <div className="relative w-48 h-48 mx-auto rounded-full overflow-hidden border-4 border-emerald-500 shadow-2xl">
                <img src={capturedImage} alt="Captured" className="w-full h-full object-cover" />
              </div>

              <div className="space-y-1">
                <p className="text-xl font-black text-indigo-900">{detectedStudent.name}</p>
                <p className="text-sm font-bold text-indigo-500 bg-indigo-50 inline-block px-3 py-1 rounded-full">{detectedClass?.name}</p>
              </div>

              <div className="flex flex-col gap-3 pt-4">
                <button 
                  onClick={confirmPresence}
                  className="w-full py-4 bg-emerald-500 text-white rounded-2xl font-black text-lg hover:bg-emerald-600 shadow-lg shadow-emerald-200 flex items-center justify-center gap-2 transition-all active:scale-95"
                >
                  <CheckCircle size={24} /> Confirmar Agora
                </button>
                <button 
                  onClick={cancelCapture}
                  className="w-full py-3 text-slate-400 font-bold hover:text-red-500 transition-colors"
                >
                  Não sou eu / Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendanceCapture;


