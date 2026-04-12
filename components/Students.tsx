import React, { useState, useRef, useEffect } from 'react';
import { SchoolData, Student, Class } from '../types';
import { dbService } from '../services/dbService';
import { addHeader, pdfService } from '../services/pdfService';
import { useDialog } from '../DialogContext';
import { compressImage } from '../services/imageService';
import { Search, Plus, Edit2, Trash2, User, Camera, Upload, X, CheckCircle, Loader2, Save, Image as ImageIcon, SwitchCamera, FileDown, Eye, FileText, AlertCircle, ArrowRightLeft, UserX, Printer, BookOpen, Barcode, Receipt, RefreshCw, ArrowLeft, Users } from 'lucide-react';
import * as faceapi from '@vladmandic/face-api';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface StudentsProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
  deepLinkStudentId?: string | null;
  deepLinkClassId?: string | null;
  clearDeepLink?: () => void;
}

const Students: React.FC<StudentsProps> = ({ data, updateData, deepLinkStudentId, deepLinkClassId, clearDeepLink }) => {
  const { showAlert, showConfirm } = useDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [viewingStudentHistory, setViewingStudentHistory] = useState<Student | null>(null);
  const [transferringStudent, setTransferringStudent] = useState<Student | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState<Student | null>(null);
  const [newClassId, setNewClassId] = useState('');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isFetchingCarne, setIsFetchingCarne] = useState(false);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [showDeleteBatchModal, setShowDeleteBatchModal] = useState(false);
  const [showFallbackModal, setShowFallbackModal] = useState(false);
  const [fallbackInstallments, setFallbackInstallments] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<'active' | 'cancelled'>('active');
  const [cancellationReason, setCancellationReason] = useState('');
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  
  // Form State
  const [formData, setFormData] = useState<Partial<Student>>({
    name: '',
    email: '',
    phone: '',
    birthDate: '',
    cpf: '',
    rg: '',
    rgIssueDate: '',
    guardianName: '',
    guardianPhone: '',
    guardianCpf: '',
    guardianBirthDate: '',
    classId: '',
    status: 'active',
    registrationDate: new Date().toISOString().split('T')[0],
    addressZip: '',
    addressStreet: '',
    addressNumber: '',
    addressNeighborhood: '',
    addressCity: '',
    addressState: '',
    discount: 0,
    hasGuardian: false,
    contractTemplateId: '',
    generateFee: false, // UI only
    generateContract: false // UI only
  } as any);

  // Camera State
  const [cameraActive, setCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [tempPhoto, setTempPhoto] = useState<string | null>(null);
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [isProcessingFace, setIsProcessingFace] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Process Deep Links (from Classes or Notifications)
  useEffect(() => {
    if (deepLinkClassId) {
      setSelectedClassId(deepLinkClassId);
      if (clearDeepLink) clearDeepLink();
    }
    if (deepLinkStudentId) {
      const student = data.students.find(s => s.id === deepLinkStudentId);
      if (student) {
        setSearchTerm(student.name);
        if (student.status === 'cancelled') setActiveTab('cancelled');
        else setActiveTab('active');
        if (student.classId) setSelectedClassId(student.classId);
      }
      if (clearDeepLink) clearDeepLink();
    }
  }, [deepLinkStudentId, deepLinkClassId, data.students]);

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
        console.error("Error loading models", err);
      }
    };
    loadModels();
  }, []);

  // Mask Helpers
  const maskCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})/, '$1-$2')
      .replace(/(-\d{2})\d+?$/, '$1');
  };

  const maskPhone = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{4})\d+?$/, '$1');
  };

  const maskCEP = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .replace(/(-\d{3})\d+?$/, '$1');
  };

  const maskDate = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1/$2')
      .replace(/(\d{2})(\d)/, '$1/$2')
      .replace(/(\d{4})\d+?$/, '$1');
  };

  const isValidCPF = (cpf: string) => {
    if (typeof cpf !== "string") return false;
    cpf = cpf.replace(/[\s.-]*/igm, '');
    if (
        !cpf ||
        cpf.length != 11 ||
        cpf == "00000000000" ||
        cpf == "11111111111" ||
        cpf == "22222222222" ||
        cpf == "33333333333" ||
        cpf == "44444444444" ||
        cpf == "55555555555" ||
        cpf == "66666666666" ||
        cpf == "77777777777" ||
        cpf == "88888888888" ||
        cpf == "99999999999" 
    ) {
        return false;
    }
    var soma = 0;
    var resto;
    for (var i = 1; i <= 9; i++) 
        soma = soma + parseInt(cpf.substring(i-1, i)) * (11 - i);
    resto = (soma * 10) % 11;
    if ((resto == 10) || (resto == 11))  resto = 0;
    if (resto != parseInt(cpf.substring(9, 10)) ) return false;
    soma = 0;
    for (var i = 1; i <= 10; i++) 
        soma = soma + parseInt(cpf.substring(i-1, i)) * (12 - i);
    resto = (soma * 10) % 11;
    if ((resto == 10) || (resto == 11))  resto = 0;
    if (resto != parseInt(cpf.substring(10, 11) ) ) return false;
    return true;
  };

  const calculateAge = (dateString: string) => {
    if (!dateString || !dateString.includes('-')) return null;
    const [year, month, day] = dateString.split('-').map(Number);
    const birthDate = new Date(year, month - 1, day);
    const today = new Date();
    
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  };

  const handleCPFChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'cpf' | 'guardianCpf') => {
    setFormData(prev => ({ ...prev, [field]: maskCPF(e.target.value) }));
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'phone' | 'guardianPhone' = 'phone') => {
    setFormData(prev => ({ ...prev, [field]: maskPhone(e.target.value) }));
  };

  const handleCEPChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = maskCEP(e.target.value);
    setFormData(prev => ({ ...prev, addressZip: val }));
    
    // Auto-check CEP when 8 digits (ignoring mask chars)
    const numericCEP = val.replace(/\D/g, '');
    if (numericCEP.length === 8) {
        checkCEP(val);
    }
  };
  
  // Improved Date Handling
  const [birthDateInput, setBirthDateInput] = useState('');
  const [guardianBirthDateInput, setGuardianBirthDateInput] = useState('');
  const [rgIssueDateInput, setRgIssueDateInput] = useState('');

  useEffect(() => {
    if (formData.birthDate) {
        const parts = formData.birthDate.split('-');
        if (parts.length === 3) {
            setBirthDateInput(`${parts[2]}/${parts[1]}/${parts[0]}`);
        } else {
             setBirthDateInput(formData.birthDate);
        }
    } else {
        setBirthDateInput('');
    }
  }, [formData.birthDate]);

  useEffect(() => {
    if (formData.guardianBirthDate) {
        const parts = formData.guardianBirthDate.split('-');
        if (parts.length === 3) {
            setGuardianBirthDateInput(`${parts[2]}/${parts[1]}/${parts[0]}`);
        } else {
             setGuardianBirthDateInput(formData.guardianBirthDate);
        }
    } else {
        setGuardianBirthDateInput('');
    }
  }, [formData.guardianBirthDate]);

  useEffect(() => {
    if (formData.rgIssueDate) {
        const parts = formData.rgIssueDate.split('-');
        if (parts.length === 3) {
            setRgIssueDateInput(`${parts[2]}/${parts[1]}/${parts[0]}`);
        } else {
             setRgIssueDateInput(formData.rgIssueDate);
        }
    } else {
        setRgIssueDateInput('');
    }
  }, [formData.rgIssueDate]);

  const onBirthDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = maskDate(e.target.value);
      setBirthDateInput(val);
      
      if (val.length === 10) {
          const parts = val.split('/');
          if (parts.length === 3) {
              const day = parseInt(parts[0]);
              const month = parseInt(parts[1]);
              const year = parseInt(parts[2]);
              
              if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900) {
                  const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                  const age = calculateAge(isoDate);
                  setFormData(prev => ({ 
                    ...prev, 
                    birthDate: isoDate,
                    hasGuardian: age !== null && age < 18 ? true : prev.hasGuardian
                  }));
              }
          }
      }
  };

  const onGuardianBirthDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = maskDate(e.target.value);
      setGuardianBirthDateInput(val);
      
      if (val.length === 10) {
          const parts = val.split('/');
          if (parts.length === 3) {
              const day = parseInt(parts[0]);
              const month = parseInt(parts[1]);
              const year = parseInt(parts[2]);
              
              if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900) {
                  const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                  setFormData(prev => ({ ...prev, guardianBirthDate: isoDate }));
              }
          }
      }
  };

  const onRgIssueDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = maskDate(e.target.value);
      setRgIssueDateInput(val);
      
      if (val.length === 10) {
          const parts = val.split('/');
          if (parts.length === 3) {
              const day = parseInt(parts[0]);
              const month = parseInt(parts[1]);
              const year = parseInt(parts[2]);
              
              if (day > 0 && day <= 31 && month > 0 && month <= 12 && year > 1900) {
                  const isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
                  setFormData(prev => ({ ...prev, rgIssueDate: isoDate }));
              }
          }
      }
  };

  const generateEnrollmentPDF = async (student?: Student) => {
    setIsGeneratingPDF(true);
    try {
      const targetData = student || formData;
      if (!targetData.id) {
        showAlert('Atenção', '⚠️ Salve o aluno antes de gerar a ficha.', 'warning');
        return;
      }
      await pdfService.generateStudentRegistrationPDF(targetData as Student, data);
    } catch (error) {
      console.error('Error generating PDF:', error);
      showAlert('Erro', 'Ocorreu um erro ao gerar o PDF.', 'error');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handlePrintCarne = async (studentId: string) => {
    setIsFetchingCarne(true);
    try {
      const response = await fetch(`/api/alunos/${studentId}/carne`);
      const result = await response.json();

      if (response.ok) {
        if (result.type === 'fallback') {
          setFallbackInstallments(result.boletos);
          setShowFallbackModal(true);
          showAlert('Atenção', result.message, 'info');
        } else if (result.type === 'pdf' && result.url) {
          window.open(result.url, '_blank', 'noopener,noreferrer');
          showAlert('Sucesso', 'Carnê localizado com sucesso!', 'success');
        } else if (result.url) {
          window.open(result.url, '_blank', 'noopener,noreferrer');
          showAlert('Sucesso', 'Carnê localizado com sucesso!', 'success');
        }
      } else {
        // O backend agora retorna 400 com mensagem específica se não for parcelamento
        showAlert('Atenção', result.error || 'Não foi possível encontrar o carnê deste aluno.', response.status === 400 ? 'warning' : 'error');
      }
    } catch (error) {
      console.error('Erro ao buscar carnê:', error);
      showAlert('Erro', 'Ocorreu um erro ao processar sua solicitação.', 'error');
    } finally {
      setIsFetchingCarne(false);
    }
  };

  const handleOpenPaymentLink = async (asaasPaymentId: string, type: 'boleto' | 'recibo') => {
    try {
      showAlert('Aguarde', `Buscando ${type}...`, 'info');
      const response = await fetch(`/api/cobrancas/${asaasPaymentId}/link`);
      const result = await response.json();

      if (response.ok) {
        const url = type === 'boleto' ? result.bankSlipUrl : result.transactionReceiptUrl;
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
        } else {
          showAlert('Atenção', `${type === 'boleto' ? 'Boleto' : 'Recibo'} não disponível.`, 'warning');
        }
      } else {
        showAlert('Erro', result.error || `Falha ao buscar ${type}.`, 'error');
      }
    } catch (error) {
      console.error(`Erro ao buscar ${type}:`, error);
      showAlert('Erro', 'Ocorreu um erro ao processar sua solicitação.', 'error');
    }
  };

  const handleDeleteBatch = async () => {
    if (selectedPayments.length === 0) return;
    
    setIsDeletingBatch(true);
    try {
      const response = await fetch('/api/cobrancas/lote', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids: selectedPayments })
      });

      if (response.ok || response.status === 207) {
        const result = await response.json();
        showAlert('Sucesso', result.message || 'Cobranças excluídas com sucesso.', 'success');
        
        // Atualizar dados locais (Supabase já foi atualizado pelo backend)
        const updatedPayments = data.payments.filter(p => !selectedPayments.includes(p.asaasPaymentId || ''));
        updateData({ payments: updatedPayments });
        
        setSelectedPayments([]);
        setShowDeleteBatchModal(false);
      } else {
        const errorData = await response.json();
        showAlert('Erro', errorData.error || 'Falha ao excluir cobranças em lote.', 'error');
      }
    } catch (error) {
      console.error('Erro na exclusão em lote:', error);
      showAlert('Erro', 'Erro de conexão ao tentar excluir cobranças.', 'error');
    } finally {
      setIsDeletingBatch(false);
    }
  };

  const togglePaymentSelection = (asaasId: string) => {
    if (!asaasId) return;
    setSelectedPayments(prev => 
      prev.includes(asaasId) 
        ? prev.filter(id => id !== asaasId) 
        : [...prev, asaasId]
    );
  };

  const checkCEP = async (cepValue?: string) => {
    const cep = (cepValue || formData.addressZip)?.replace(/\D/g, '');
    if (cep?.length === 8) {
      try {
        const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        const data = await res.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            addressStreet: data.logradouro,
            addressNeighborhood: data.bairro,
            addressCity: data.localidade,
            addressState: data.uf
          }));
        }
      } catch (e) {
        console.error("CEP Error", e);
      }
    }
  };

  const processFace = async (imageElement: HTMLImageElement | HTMLVideoElement | HTMLCanvasElement) => {
    if (!modelsLoaded) return null;
    setIsProcessingFace(true);
    try {
      const detection = await faceapi.detectSingleFace(imageElement, new faceapi.TinyFaceDetectorOptions())
        .withFaceLandmarks()
        .withFaceDescriptor();
      
      if (detection) {
        return Array.from(detection.descriptor);
      }
      return null;
    } catch (error) {
      console.error("Face processing error", error);
      return null;
    } finally {
      setIsProcessingFace(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressed = await compressImage(file);
        setFormData(prev => ({ ...prev, photo: compressed }));
        
        const img = document.createElement('img');
        img.src = compressed;
        img.onload = async () => {
          const descriptor = await processFace(img);
          if (descriptor) {
            setFormData(prev => ({ ...prev, faceDescriptor: descriptor }));
          } else {
            showAlert('Atenção', "Nenhum rosto detectado na foto. Por favor, use uma foto clara do rosto.", 'warning');
          }
        };
      } catch (error) {
        console.error('Erro ao comprimir imagem:', error);
        showAlert('Erro', 'Falha ao processar imagem.', 'error');
      }
    }
  };

  const startCamera = async () => {
    try {
      setTempPhoto(null);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: facingMode } 
      });
      
      streamRef.current = stream;
      setCameraActive(true);
    } catch (err) {
      console.error("Error accessing camera:", err);
      showAlert('Erro', "Erro ao acessar câmera. Verifique as permissões.", 'error');
    }
  };

  const switchCamera = () => {
    setFacingMode(prev => prev === 'user' ? 'environment' : 'user');
  };

  // Effect to restart camera when facingMode changes if already active
  useEffect(() => {
    if (cameraActive && !tempPhoto) {
      startCamera();
    }
  }, [facingMode]);

  // Effect to attach stream to video element when it becomes available
  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current && !tempPhoto) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [cameraActive, tempPhoto]);

  const takePicture = () => {
    if (videoRef.current) {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth;
      canvas.height = videoRef.current.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        // Use WebP for capture too
        const base64 = canvas.toDataURL('image/webp', 0.8);
        setTempPhoto(base64);
      }
    }
  };

  const retakePhoto = () => {
    setTempPhoto(null);
  };

  const savePhoto = async () => {
    if (tempPhoto) {
      try {
        const compressed = await compressImage(tempPhoto);
        setFormData(prev => ({ ...prev, photo: compressed }));
        
        // Process face
        const img = document.createElement('img');
        img.src = compressed;
        img.onload = async () => {
          const descriptor = await processFace(img);
          if (descriptor) {
            setFormData(prev => ({ ...prev, faceDescriptor: descriptor }));
          } else {
            showAlert('Atenção', "Nenhum rosto detectado na foto. Por favor, use uma foto clara do rosto.", 'warning');
          }
        };
        
        stopCamera();
      } catch (error) {
        console.error('Erro ao comprimir foto:', error);
        showAlert('Erro', 'Falha ao processar foto da câmera.', 'error');
      }
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
    setTempPhoto(null);
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowModal(false);
      setIsClosing(false);
      setEditingStudent(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        birthDate: '',
        cpf: '',
        rg: '',
        rgIssueDate: '',
        guardianName: '',
        guardianPhone: '',
        guardianCpf: '',
        guardianBirthDate: '',
        classId: '',
        status: 'active',
        registrationDate: new Date().toISOString().split('T')[0],
        addressZip: '',
        addressStreet: '',
        addressNumber: '',
        addressNeighborhood: '',
        addressCity: '',
        addressState: '',
        discount: 0,
        hasGuardian: false,
        contractTemplateId: '',
        generateFee: false,
        generateContract: false
      } as any);
      setBirthDateInput('');
      setRgIssueDateInput('');
      setGuardianBirthDateInput('');
    }, 400);
  };

  const closeHistoryModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setViewingStudentHistory(null);
      setSelectedPayments([]);
      setIsClosing(false);
    }, 400);
  };

  const closeTransferModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setTransferringStudent(null);
      setIsClosing(false);
      setNewClassId('');
    }, 400);
  };

  const closeDeleteModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowDeleteModal(null);
      setIsClosing(false);
    }, 400);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.classId) {
      showAlert('Atenção', '⚠️ Nome e Turma são obrigatórios', 'warning');
      return;
    }

    // Validation for minors
    if (formData.birthDate) {
      const age = calculateAge(formData.birthDate);
      if (age !== null && age < 18) {
        if (!formData.hasGuardian) {
          showAlert('Atenção', '⚠️ Para alunos menores de 18 anos, os dados do responsável são obrigatórios.', 'warning');
          return;
        }
        if (!formData.guardianName || !formData.guardianCpf || !formData.guardianPhone) {
          showAlert('Atenção', '⚠️ Nome, CPF e Telefone do responsável são obrigatórios para menores de 18 anos.', 'warning');
          return;
        }
        if (formData.guardianCpf && !isValidCPF(formData.guardianCpf)) {
          showAlert('Atenção', '⚠️ O CPF do responsável informado é inválido.', 'warning');
          return;
        }
      }
    }

    let updatedStudents;
    let newPayments = [...data.payments];
    let newContracts = [...data.contracts];
    
    const studentId = editingStudent ? editingStudent.id : crypto.randomUUID();

    // Gerar número de matrícula automático para novos alunos
    let enrollmentNumber = formData.enrollmentNumber || editingStudent?.enrollmentNumber;
    if (!enrollmentNumber) {
      const year = new Date().getFullYear();
      const existingCount = data.students.filter(s => s.enrollmentNumber?.startsWith(`MAT-${year}`)).length;
      enrollmentNumber = `MAT-${year}${String(existingCount + 1).padStart(5, '0')}`;
    }

    // Gerar senha padrão do portal (6 primeiros dígitos do CPF)
    let portalPassword = formData.portalPassword || editingStudent?.portalPassword;
    if (!portalPassword) {
      const rawCpfForPassword = (formData.cpf || '').replace(/\D/g, '');
      portalPassword = rawCpfForPassword.substring(0, 6) || '123456';
    }

    const studentToSave: Student = {
      ...(editingStudent || { id: studentId }),
      ...formData as Student,
      enrollmentNumber,
      portalPassword
    };

    if (editingStudent) {
      updatedStudents = data.students.map(s => 
        s.id === editingStudent.id ? studentToSave : s
      );
    } else {
      updatedStudents = [...data.students, studentToSave];
    }

    // Process Generate Fee and Contract
    const studentClass = data.classes.find(c => c.id === formData.classId);
    const course = studentClass ? data.courses.find(c => c.id === studentClass.courseId) : null;

    if ((formData as any).generateFee && course) {
      const feeAmount = (course.registrationFee || 0) - (formData.discount || 0);
      if (feeAmount > 0) {
        newPayments.push({
          id: crypto.randomUUID(),
          studentId: studentToSave.id,
          amount: feeAmount,
          dueDate: new Date().toISOString().split('T')[0],
          status: 'pending',
          type: 'registration',
          description: 'Taxa de Matrícula'
        });

        try {
          const rawCpf = (formData.cpf || formData.guardianCpf || '').replace(/\D/g, '');
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 5);
          const formattedDueDate = dueDate.toISOString().split('T')[0];

          const response = await fetch('/api/gerar_cobranca', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              aluno_id: studentToSave.id,
              nome: studentToSave.name,
              cpf: rawCpf,
              email: formData.email,
              telefone: formData.phone?.replace(/\D/g, ''),
              cep: formData.addressZip?.replace(/\D/g, ''),
              endereco: formData.addressStreet,
              numero: formData.addressNumber,
              bairro: formData.addressNeighborhood,
              valor: feeAmount,
              vencimento: formattedDueDate,
              multa: 0,
              juros: 0,
              parcelas: 1,
              descricao: 'Taxa de Matrícula'
            })
          });

          if (response.ok) {
            const result = await response.json();
            const lastPayment = newPayments[newPayments.length - 1];
            if (lastPayment) {
              lastPayment.asaasPaymentUrl = result.bankSlipUrl;
              lastPayment.asaasPaymentId = result.paymentId;
            }
          } else {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || 'Erro na resposta da API');
          }
        } catch (error: any) {
          console.error('Erro ao gerar cobrança:', error);
          showAlert('Atenção', `Erro ao gerar boleto no Asaas: ${error.message}. O aluno foi salvo no sistema local.`, 'warning');
        }
      }
    }

    if ((formData as any).generateContract && course) {
      const templateObj = data.contractTemplates?.find(t => t.id === formData.contractTemplateId);
      let content = templateObj?.content || '';
      
      // Aluno
      content = content.replace(/{{aluno}}/g, studentToSave.name || '');
      content = content.replace(/{{aluno_cpf}}/g, studentToSave.cpf || '');
      content = content.replace(/{{aluno_rg}}/g, studentToSave.rg || '');
      content = content.replace(/{{aluno_nascimento}}/g, studentToSave.birthDate ? new Date(studentToSave.birthDate).toLocaleDateString('pt-BR') : '');
      content = content.replace(/{{aluno_email}}/g, studentToSave.email || '');
      content = content.replace(/{{aluno_telefone}}/g, studentToSave.phone || '');
      content = content.replace(/{{aluno_cep}}/g, studentToSave.addressZip || '');
      content = content.replace(/{{aluno_endereco}}/g, `${studentToSave.addressStreet || ''}, ${studentToSave.addressNumber || ''}`);
      content = content.replace(/{{aluno_bairro}}/g, studentToSave.addressNeighborhood || '');
      content = content.replace(/{{aluno_cidade}}/g, studentToSave.addressCity || '');
      content = content.replace(/{{aluno_estado}}/g, studentToSave.addressState || '');

      // Responsável
      content = content.replace(/{{responsavel_nome}}/g, studentToSave.guardianName || '');
      content = content.replace(/{{responsavel_cpf}}/g, studentToSave.guardianCpf || '');
      content = content.replace(/{{responsavel_nascimento}}/g, studentToSave.guardianBirthDate ? new Date(studentToSave.guardianBirthDate).toLocaleDateString('pt-BR') : '');

      // Curso e Turma
      content = content.replace(/{{curso}}/g, course.name || '');
      content = content.replace(/{{mensalidade}}/g, course.monthlyFee ? `R$ ${course.monthlyFee.toFixed(2)}` : 'R$ 0,00');
      content = content.replace(/{{duracao}}/g, course.duration || '');
      content = content.replace(/{{curso_taxa_matricula}}/g, course.registrationFee ? `R$ ${course.registrationFee.toFixed(2)}` : 'R$ 0,00');
      content = content.replace(/{{turma_nome}}/g, studentClass?.name || '');
      content = content.replace(/{{turma_professor}}/g, studentClass?.teacher || '');
      content = content.replace(/{{turma_horario}}/g, studentClass?.schedule || '');

      // Escola
      content = content.replace(/{{data}}/g, new Date().toLocaleDateString('pt-BR'));
      content = content.replace(/{{escola}}/g, data.profile.name || '');
      content = content.replace(/{{cnpj_escola}}/g, data.profile.cnpj || '');

      newContracts.push({
        id: crypto.randomUUID(),
        studentId: studentToSave.id,
        title: `Contrato - ${course.name}`,
        content,
        createdAt: new Date().toISOString()
      });
    }

    const newData = {
      students: updatedStudents,
      payments: newPayments,
      contracts: newContracts
    };

    updateData(newData);
    dbService.saveData({ ...data, ...newData });
    showAlert('Sucesso', (formData as any).generateFee ? 'Aluno salvo e nova cobrança gerada com sucesso.' : 'Aluno salvo com sucesso.', 'success');
    closeModal();
  };

  const handleDelete = (student: Student) => {
    setShowDeleteModal(student);
    setCancellationReason('');
  };

  const confirmCancellation = async (generatePDF: boolean) => {
    if (!showDeleteModal) return;
    if (!cancellationReason.trim()) {
      showAlert('Atenção', 'Por favor, informe o motivo do cancelamento.', 'warning');
      return;
    }

    const updatedStudents = data.students.map(s => 
      s.id === showDeleteModal.id ? { ...s, status: 'cancelled' as const, cancellationReason, classId: '' } : s
    );
    
    updateData({ students: updatedStudents });
    dbService.saveData({ ...data, students: updatedStudents });
    
    if (generatePDF) {
      await pdfService.generateCancellationTermPDF(showDeleteModal, data, cancellationReason);
    }
    
    showAlert('Sucesso', 'Matrícula cancelada com sucesso.', 'success');
    setShowDeleteModal(null);
    setCancellationReason('');
  };

  const handleRematricular = async (student: Student) => {
    showConfirm(
      'Rematricular Aluno',
      `Deseja reativar a matrícula de ${student.name}?`,
      async () => {
        try {
          // Faz a requisição para o backend (apenas para constar, pois o estado é gerenciado pelo dbService)
          const response = await fetch(`/api/alunos/${student.id}/rematricular`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
          });
          
          if (!response.ok) {
            throw new Error('Falha ao rematricular no servidor');
          }

          // Atualiza o estado local
          const updatedStudents = data.students.map(s => 
            s.id === student.id ? { ...s, status: 'active' as const, cancellationReason: undefined } : s
          );
          
          updateData({ students: updatedStudents });
          dbService.saveData({ ...data, students: updatedStudents });
          
          showAlert('Sucesso', 'Aluno rematriculado com sucesso.', 'success');
        } catch (error) {
          console.error('Erro ao rematricular:', error);
          showAlert('Erro', 'Ocorreu um erro ao rematricular o aluno.', 'error');
        }
      }
    );
  };

  const handleDeletePermanently = (student: Student) => {
    showConfirm(
      'Excluir Aluno Definitivamente',
      `⚠️ Atenção: Esta ação irá remover permanentemente ${student.name} e todo o seu histórico (mensalidades, contratos e presenças). Esta ação NÃO pode ser desfeita. Deseja continuar?`,
      async () => {
        const updatedStudents = data.students.filter(s => s.id !== student.id);
        const updatedPayments = data.payments.filter(p => p.studentId !== student.id);
        const updatedContracts = data.contracts.filter(c => c.studentId !== student.id);
        const updatedAttendance = data.attendance?.filter(a => a.studentId !== student.id) || [];
        const updatedNotifications = data.notifications?.filter(n => n.studentId !== student.id) || [];
        
        const newData = {
          students: updatedStudents,
          payments: updatedPayments,
          contracts: updatedContracts,
          attendance: updatedAttendance,
          notifications: updatedNotifications
        };
        
        updateData(newData);
        dbService.saveData({ ...data, ...newData });
        showAlert('Sucesso', 'O aluno e todo o seu histórico foram removidos permanentemente.', 'success');
      }
    );
  };

  const handleTransferStudent = () => {
    if (!transferringStudent || !newClassId) return;

    const updatedStudents = data.students.map(s => 
      s.id === transferringStudent.id ? { ...s, classId: newClassId } : s
    );
    updateData({ students: updatedStudents });
    dbService.saveData({ ...data, students: updatedStudents });
    showAlert('Sucesso', 'Aluno transferido com sucesso.', 'success');
    closeTransferModal();
  };

  const openModal = (student?: Student) => {
    const defaultData: any = {
      name: '',
      email: '',
      phone: '',
      birthDate: '',
      cpf: '',
      rg: '',
      rgIssueDate: '',
      guardianName: '',
      guardianPhone: '',
      guardianCpf: '',
      guardianBirthDate: '',
      classId: '',
      status: 'active',
      registrationDate: new Date().toISOString().split('T')[0],
      addressZip: '',
      addressStreet: '',
      addressNumber: '',
      addressNeighborhood: '',
      addressCity: '',
      addressState: '',
      discount: 0,
      hasGuardian: false,
      generateFee: true,
      generateContract: true
    };

    if (student) {
      setEditingStudent(student);
      setFormData({ ...defaultData, ...student });
    } else {
      setEditingStudent(null);
      setFormData(defaultData);
    }
    setShowModal(true);
  };

  const filteredStudents = data.students
    .filter(s => {
      const matchesSearch = (s.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
                           (s.cpf || '').includes(searchTerm) ||
                           (s.email || '').toLowerCase().includes((searchTerm || '').toLowerCase());
      const matchesTab = activeTab === 'active' ? s.status !== 'cancelled' : s.status === 'cancelled';
      const matchesClass = selectedClassId ? (selectedClassId === 'none' ? !s.classId : s.classId === selectedClassId) : true;
      return matchesSearch && matchesTab && matchesClass;
    })
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const generatePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      await pdfService.generateStudentListPDF(data);
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      showAlert('Erro', 'Falha ao gerar o relatório de alunos.', 'error');
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Alunos</h2>
          <p className="text-slate-500 font-medium">Gerencie matrículas e dados dos alunos.</p>
        </div>
        <div className="flex gap-2">
            <button 
              onClick={generatePDF} 
              disabled={isGeneratingPDF}
              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors font-bold text-sm flex items-center gap-2 disabled:opacity-50"
            >
              {isGeneratingPDF ? <Loader2 size={18} className="animate-spin" /> : <FileDown size={18} />} 
              {isGeneratingPDF ? 'Gerando...' : 'Exportar PDF'}
            </button>
            <button onClick={() => openModal()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-bold text-sm flex items-center gap-2 shadow-lg shadow-indigo-200">
            <Plus size={18} /> Nova Matrícula
            </button>
        </div>
      </header>

      <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xl space-y-6">
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => {
              setActiveTab('active');
              setSelectedClassId(null);
            }}
            className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'active' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Alunos Ativos
          </button>
          <button
            onClick={() => {
              setActiveTab('cancelled');
              setSelectedClassId(null);
            }}
            className={`px-6 py-3 font-bold text-sm border-b-2 transition-colors ${
              activeTab === 'cancelled' 
                ? 'border-indigo-600 text-indigo-600' 
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Alunos Cancelados
          </button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="Buscar alunos..." 
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              if (e.target.value) setSelectedClassId(null);
            }}
          />
        </div>

        {(activeTab === 'active' && !selectedClassId && !searchTerm) ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.classes.map(cls => {
              const studentCount = data.students.filter(s => s.classId === cls.id && (activeTab === 'active' ? s.status !== 'cancelled' : s.status === 'cancelled')).length;
              const course = data.courses.find(c => c.id === cls.courseId);
              
              return (
                <button
                  key={cls.id}
                  onClick={() => setSelectedClassId(cls.id)}
                  className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-300 transition-all text-left group"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                      <Users size={24} />
                    </div>
                    <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">
                      {studentCount} Alunos
                    </span>
                  </div>
                  <h4 className="text-lg font-black text-slate-800 mb-1">{cls.name}</h4>
                  <p className="text-sm text-slate-500 mb-4">{course?.name || 'Curso não encontrado'}</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <User size={14} className="text-slate-400" />
                      <span>Prof: {cls.teacher}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <BookOpen size={14} className="text-slate-400" />
                      <span>{cls.schedule}</span>
                    </div>
                  </div>
                </button>
              );
            })}
            
            {/* Card for students without class */}
            {data.students.some(s => !s.classId && (activeTab === 'active' ? s.status !== 'cancelled' : s.status === 'cancelled')) && (
              <button
                onClick={() => setSelectedClassId('none')}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-300 transition-all text-left group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="p-3 bg-amber-50 rounded-xl text-amber-600 group-hover:bg-amber-600 group-hover:text-white transition-colors">
                    <UserX size={24} />
                  </div>
                  <span className="bg-slate-100 text-slate-600 px-3 py-1 rounded-full text-xs font-bold">
                    {data.students.filter(s => !s.classId && (activeTab === 'active' ? s.status !== 'cancelled' : s.status === 'cancelled')).length} Alunos
                  </span>
                </div>
                <h4 className="text-lg font-black text-slate-800 mb-1">Sem Turma</h4>
                <p className="text-sm text-slate-500 mb-4">Alunos aguardando enturmação</p>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {(selectedClassId || searchTerm) && (
              <div className="flex items-center justify-between">
                <button 
                  onClick={() => {
                    setSelectedClassId(null);
                    setSearchTerm('');
                  }}
                  className="flex items-center gap-2 text-indigo-600 font-bold hover:text-indigo-700 transition-colors"
                >
                  <ArrowLeft size={20} />
                  Voltar para Turmas
                </button>
                {selectedClassId && (
                  <h4 className="text-lg font-black text-slate-800">
                    {selectedClassId === 'none' ? 'Alunos Sem Turma' : data.classes.find(c => c.id === selectedClassId)?.name}
                  </h4>
                )}
              </div>
            )}
            
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase text-slate-500 font-bold tracking-wider">
                    <th className="p-4">Aluno</th>
                    <th className="p-4">Turma</th>
                    <th className="p-4">Status</th>
                    <th className="p-4">Face ID</th>
                    <th className="p-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="text-sm divide-y divide-slate-50">
                  {filteredStudents.map(student => {
                    const studentClass = data.classes.find(c => c.id === student.classId);
                    return (
                      <tr key={student.id} className={`hover:bg-slate-50 transition-colors group ${student.status === 'cancelled' ? 'bg-slate-50 opacity-60 grayscale' : ''}`}>
                        <td className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                              {student.photo ? (
                                <img src={student.photo} alt={student.name} className="w-full h-full object-cover" />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-slate-400">
                                  <User size={20} />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className={`font-bold ${student.status === 'cancelled' ? 'text-slate-500' : 'text-slate-700'}`}>{student.name}</p>
                              <p className="text-xs text-slate-500">{student.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="p-4 text-slate-500">{studentClass?.name || '-'}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                            student.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 
                            student.status === 'cancelled' ? 'bg-slate-200 text-slate-600' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {student.status === 'active' ? 'Ativo' : student.status === 'cancelled' ? 'Cancelado' : 'Inativo'}
                          </span>
                        </td>
                        <td className="p-4">
                          {student.faceDescriptor ? (
                            <span className="text-emerald-500 flex items-center gap-1 font-bold text-xs"><CheckCircle size={14}/> OK</span>
                          ) : (
                            <span className="text-slate-400 text-xs">Pendente</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1 sm:gap-2">
                            {student.status !== 'cancelled' && (
                              <button onClick={() => setTransferringStudent(student)} className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors" title="Transferir Turma">
                                <ArrowRightLeft size={18} />
                              </button>
                            )}
                            <button onClick={() => generateEnrollmentPDF(student)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Imprimir Ficha">
                              <FileText size={18} />
                            </button>
                            <button onClick={() => setViewingStudentHistory(student)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Ver Histórico">
                              <Eye size={18} />
                            </button>
                            {student.status === 'cancelled' && (
                              <>
                                <button
                                  onClick={() => pdfService.generateCancellationTermPDF(student, data, student.cancellationReason || 'Não informado')}
                                  className="p-2 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                                  title="Imprimir Termo de Cancelamento"
                                >
                                  <Printer size={18} />
                                </button>
                                <button onClick={() => handleRematricular(student)} className="p-2 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Rematricular">
                                  <RefreshCw size={18} />
                                </button>
                                <button onClick={() => handleDeletePermanently(student)} className="p-2 text-slate-400 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors" title="Excluir Definitivamente">
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}
                            {student.status !== 'cancelled' && (
                              <>
                                <button onClick={() => openModal(student)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                                  <Edit2 size={18} />
                                </button>
                                <button onClick={() => handleDelete(student)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Cancelar Matrícula">
                                  <Trash2 size={18} />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Enrollment Modal */}
      {showModal && (
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-2xl w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            {/* Header */}
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-800">{editingStudent ? 'Editar Matrícula' : 'Nova Matrícula'}</h3>
                <p className="text-slate-500 text-sm">Preencha os dados do aluno e responsável.</p>
              </div>
              <button onClick={closeModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                <X size={24} className="text-slate-400" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-8">
              <div className="flex flex-col lg:flex-row gap-8">
                
                {/* Left Column: Photo */}
                <div className="w-full lg:w-64 flex-shrink-0 space-y-4">
                  <div className="aspect-[3/4] bg-slate-100 rounded-xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center relative overflow-hidden group hover:border-indigo-400 transition-colors">
                    {cameraActive ? (
                      <>
                        {!tempPhoto ? (
                          <>
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-4">
                                <button 
                                  onClick={takePicture}
                                  className="bg-white rounded-full p-4 shadow-lg hover:scale-110 transition-transform"
                                >
                                  <div className="w-4 h-4 bg-indigo-600 rounded-full"></div>
                                </button>
                            </div>
                            <button 
                              onClick={switchCamera}
                              className="absolute top-4 right-4 bg-black/50 text-white rounded-full p-2 hover:bg-black/70 transition-colors"
                              title="Trocar Câmera"
                            >
                              <SwitchCamera size={20} />
                            </button>
                          </>
                        ) : (
                          <>
                            <img src={tempPhoto} className="w-full h-full object-cover" />
                            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-2 px-4">
                                <button 
                                    onClick={retakePhoto}
                                    className="flex-1 bg-white text-slate-700 py-2 rounded-lg font-bold shadow-lg text-xs hover:bg-slate-50"
                                >
                                    Retirar
                                </button>
                                <button 
                                    onClick={savePhoto}
                                    className="flex-1 bg-indigo-600 text-white py-2 rounded-lg font-bold shadow-lg text-xs hover:bg-indigo-700"
                                >
                                    Salvar
                                </button>
                            </div>
                          </>
                        )}
                      </>
                    ) : formData.photo ? (
                      <>
                        <img src={formData.photo} alt="Student" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <p className="text-white font-bold text-xs">Alterar Foto</p>
                        </div>
                      </>
                    ) : (
                      <div className="text-center p-4">
                        <User size={48} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-xs text-slate-400 font-bold uppercase">Foto do Aluno</p>
                      </div>
                    )}
                    
                    {/* Face ID Status Indicator */}
                    {formData.faceDescriptor && (
                      <div className="absolute top-2 right-2 bg-emerald-500 text-white p-1 rounded-full shadow-sm" title="Face ID Gerado">
                        <CheckCircle size={14} />
                      </div>
                    )}
                  </div>

                  {isProcessingFace && (
                    <div className="text-center text-xs text-indigo-600 font-bold flex items-center justify-center gap-2">
                      <Loader2 size={12} className="animate-spin" /> Processando Face...
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button 
                      onClick={startCamera}
                      className="py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 flex items-center justify-center gap-2"
                    >
                      <Camera size={16} /> Câmera
                    </button>
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-200 flex items-center justify-center gap-2"
                    >
                      <Upload size={16} /> Upload
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept="image/*"
                      onChange={handleImageUpload}
                    />
                  </div>
                </div>

                {/* Right Column: Form Data */}
                <div className="flex-1 space-y-8">
                  
                  {/* Personal Data */}
                  <section className="space-y-4">
                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-100 pb-2 flex items-center gap-2">
                      <User size={14} /> Dados Pessoais
                    </h4>
                    
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nome Completo do Aluno</label>
                      <input 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                        value={formData.name || ''} 
                        onChange={e => setFormData({...formData, name: e.target.value})} 
                        placeholder="Ex: João da Silva"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">CPF Aluno</label>
                        <div className="relative">
                          <input 
                            className={`w-full px-4 py-3 bg-slate-50 border ${formData.cpf && !isValidCPF(formData.cpf) ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-indigo-500'} rounded-lg focus:outline-none focus:ring-2 transition-all font-medium text-sm`}
                            value={formData.cpf || ''} 
                            onChange={e => handleCPFChange(e, 'cpf')} 
                            placeholder="000.000.000-00"
                            maxLength={14}
                          />
                          {formData.cpf && !isValidCPF(formData.cpf) && (
                            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-red-500 font-bold">Inválido</span>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nascimento</label>
                        <div className="relative">
                          <input 
                            type="text"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                            value={birthDateInput} 
                            onChange={onBirthDateInputChange} 
                            placeholder="DD/MM/AAAA"
                            maxLength={10}
                          />
                          {formData.birthDate && calculateAge(formData.birthDate) !== null && (
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-100 text-indigo-700 text-[10px] font-bold px-2 py-1 rounded-full">
                              {calculateAge(formData.birthDate)} anos
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">RG</label>
                        <input 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.rg || ''} 
                          onChange={e => setFormData({...formData, rg: e.target.value})} 
                          placeholder="Número do RG"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data de Expedição</label>
                        <input 
                          type="text"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={rgIssueDateInput} 
                          onChange={onRgIssueDateInputChange} 
                          placeholder="DD/MM/AAAA"
                          maxLength={10}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Celular / Whatsapp</label>
                        <input 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.phone || ''} 
                          onChange={handlePhoneChange} 
                          placeholder="(00) 00000-0000"
                          maxLength={15}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Email</label>
                        <input 
                          type="email"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.email || ''} 
                          onChange={e => setFormData({...formData, email: e.target.value})} 
                          placeholder="email@exemplo.com"
                        />
                      </div>
                    </div>
                  </section>

                  {/* Portal do Aluno */}
                  <section className="space-y-4">
                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-100 pb-2">🎓 Portal do Aluno</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nº Matrícula (Login)</label>
                        <input
                          type="text"
                          className="w-full px-4 py-3 bg-slate-100 border border-slate-200 rounded-lg font-mono font-bold text-sm text-slate-700 cursor-not-allowed"
                          value={formData.enrollmentNumber || editingStudent?.enrollmentNumber || 'Gerado automaticamente ao salvar'}
                          readOnly
                          title="O número de matrícula é gerado automaticamente"
                        />
                        <span className="text-[9px] text-slate-400 mt-0.5 block">Gerado automaticamente. Será o login do aluno no portal.</span>
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Senha do Portal</label>
                        <input
                          type="text"
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.portalPassword || ''}
                          onChange={e => setFormData({...formData, portalPassword: e.target.value})}
                          placeholder={formData.cpf ? `Padrão: ${(formData.cpf || '').replace(/\D/g, '').substring(0, 6)}` : 'Será gerada ao salvar'}
                        />
                        <span className="text-[9px] text-slate-400 mt-0.5 block">Padrão: 6 primeiros dígitos do CPF. Pode ser alterada a qualquer momento.</span>
                      </div>
                    </div>
                  </section>

                  {/* Address Data */}
                  <section className="space-y-4">
                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-100 pb-2">Endereço Residencial</h4>
                    
                    <div className="grid grid-cols-4 gap-4">
                      <div className="col-span-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">CEP</label>
                        <input 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.addressZip || ''} 
                          onChange={handleCEPChange}
                          onBlur={() => checkCEP()}
                          placeholder="00000-000"
                          maxLength={9}
                        />
                      </div>
                      <div className="col-span-2">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Logradouro</label>
                        <input 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.addressStreet || ''} 
                          onChange={e => setFormData({...formData, addressStreet: e.target.value})} 
                          placeholder="Rua, Avenida..."
                        />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nº</label>
                        <input 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.addressNumber || ''} 
                          onChange={e => setFormData({...formData, addressNumber: e.target.value})} 
                          placeholder="123"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Bairro</label>
                        <input 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.addressNeighborhood || ''} 
                          onChange={e => setFormData({...formData, addressNeighborhood: e.target.value})} 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Cidade</label>
                        <input 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.addressCity || ''} 
                          onChange={e => setFormData({...formData, addressCity: e.target.value})} 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">UF</label>
                        <input 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.addressState || ''} 
                          onChange={e => setFormData({...formData, addressState: e.target.value})} 
                          maxLength={2}
                        />
                      </div>
                    </div>
                  </section>

                  {/* Financial Guardian */}
                  <section className="space-y-4">
                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-100 pb-2">Responsável Financeiro</h4>
                    
                    <div className="flex items-center gap-2 mb-4">
                      <input 
                        type="checkbox" 
                        id="hasGuardian"
                        className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                        checked={formData.hasGuardian || false}
                        onChange={e => setFormData({...formData, hasGuardian: e.target.checked})}
                      />
                      <label htmlFor="hasGuardian" className="text-sm font-bold text-slate-700">Possui Responsável?</label>
                      {formData.birthDate && calculateAge(formData.birthDate) !== null && calculateAge(formData.birthDate)! < 18 && !formData.hasGuardian && (
                        <span className="text-[10px] text-red-500 font-bold ml-2 flex items-center gap-1">
                          <AlertCircle size={12} /> Obrigatório para menores de 18 anos
                        </span>
                      )}
                    </div>

                    {formData.hasGuardian && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-in fade-in slide-in-from-top-2">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Nome do Responsável {formData.birthDate && calculateAge(formData.birthDate)! < 18 && <span className="text-red-500">*</span>}
                          </label>
                          <input 
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                            value={formData.guardianName || ''} 
                            onChange={e => setFormData({...formData, guardianName: e.target.value})} 
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            CPF do Responsável {formData.birthDate && calculateAge(formData.birthDate)! < 18 && <span className="text-red-500">*</span>}
                          </label>
                          <div className="relative">
                            <input 
                              className={`w-full px-4 py-3 bg-slate-50 border ${formData.guardianCpf && !isValidCPF(formData.guardianCpf) ? 'border-red-300 focus:ring-red-500' : 'border-slate-200 focus:ring-indigo-500'} rounded-lg focus:outline-none focus:ring-2 transition-all font-medium text-sm`}
                              value={formData.guardianCpf || ''} 
                              onChange={e => handleCPFChange(e, 'guardianCpf')} 
                              maxLength={14}
                              placeholder="000.000.000-00"
                            />
                            {formData.guardianCpf && !isValidCPF(formData.guardianCpf) && (
                              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-red-500 font-bold">Inválido</span>
                            )}
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                            Telefone do Responsável {formData.birthDate && calculateAge(formData.birthDate)! < 18 && <span className="text-red-500">*</span>}
                          </label>
                          <input 
                            type="tel"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                            value={formData.guardianPhone || ''} 
                            onChange={e => handlePhoneChange(e, 'guardianPhone')} 
                            placeholder="(00) 00000-0000"
                            maxLength={15}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Data de Nascimento</label>
                          <input 
                            type="text"
                            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                            value={guardianBirthDateInput} 
                            onChange={onGuardianBirthDateInputChange} 
                            placeholder="DD/MM/AAAA"
                            maxLength={10}
                          />
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Enrollment Data */}
                  <section className="space-y-4">
                    <h4 className="text-xs font-black text-indigo-600 uppercase tracking-widest border-b border-indigo-100 pb-2">Dados da Matrícula</h4>
                    
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Turma de Interesse</label>
                      <select 
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                        value={formData.classId || ''} 
                        onChange={e => setFormData({...formData, classId: e.target.value})}
                      >
                        <option value="">Selecione uma turma...</option>
                        {data.classes.map(c => (
                          <option key={c.id} value={c.id}>{c.name} - {c.schedule}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Status</label>
                        <select 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.status || 'active'} 
                          onChange={e => setFormData({...formData, status: e.target.value as any})}
                        >
                          <option value="active">Ativo</option>
                          <option value="inactive">Inativo</option>
                          <option value="cancelled">Cancelado</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 mt-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Modelo de Contrato</label>
                        <select 
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all font-medium text-sm"
                          value={formData.contractTemplateId || ''} 
                          onChange={e => setFormData({...formData, contractTemplateId: e.target.value})}
                        >
                          <option value="">Selecione um modelo...</option>
                          {data.contractTemplates?.map(t => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id="generateFee"
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                            checked={(formData as any).generateFee || false}
                            onChange={e => setFormData({...formData, generateFee: e.target.checked} as any)}
                          />
                          <label htmlFor="generateFee" className="text-sm font-medium text-slate-600">Gerar Taxa de Matrícula</label>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <input 
                            type="checkbox" 
                            id="generateContract"
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                            checked={(formData as any).generateContract || false}
                            onChange={e => setFormData({...formData, generateContract: e.target.checked} as any)}
                          />
                          <label htmlFor="generateContract" className="text-sm font-medium text-slate-600">Gerar Contrato Automático</label>
                        </div>
                      </div>
                    </div>
                  </section>

                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-8 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-4">
              <button 
                onClick={() => generateEnrollmentPDF()}
                disabled={isGeneratingPDF}
                className="px-6 py-3 bg-slate-100 text-slate-600 rounded-lg font-bold hover:bg-slate-200 transition-colors flex items-center gap-2 mr-auto disabled:opacity-50"
              >
                {isGeneratingPDF ? <Loader2 size={18} className="animate-spin" /> : <FileText size={18} />} 
                {isGeneratingPDF ? 'Gerando...' : 'Imprimir Ficha'}
              </button>
              <button 
                onClick={closeModal}
                className="px-6 py-3 text-slate-500 font-bold hover:text-slate-700 transition-colors"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSave}
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all flex items-center gap-2"
              >
                <Save size={18} /> Salvar Matrícula
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Transfer Student Modal */}
      {transferringStudent && (
        <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-2xl w-full max-w-md shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-amber-50">
              <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                <ArrowRightLeft size={20} className="text-amber-600" /> Transferir Aluno
              </h3>
              <button onClick={closeTransferModal} className="p-1 hover:bg-white/50 rounded-full transition-colors">
                <X size={20} className="text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-600">
                Selecione a nova turma para <strong>{transferringStudent.name}</strong>:
              </p>
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">Nova Turma</label>
                <select 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg focus:ring-2 focus:ring-amber-500 focus:outline-none transition-all font-medium text-sm"
                  value={newClassId} 
                  onChange={e => setNewClassId(e.target.value)}
                >
                  <option value="">Selecione uma turma...</option>
                  {data.classes.filter(c => c.id !== transferringStudent.classId).map(c => (
                    <option key={c.id} value={c.id}>{c.name} - {c.schedule}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-3 pt-2">
                <button 
                  onClick={closeTransferModal}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleTransferStudent}
                  disabled={!newClassId}
                  className="flex-1 py-3 bg-amber-600 text-white rounded-lg font-bold hover:bg-amber-700 shadow-lg shadow-amber-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Confirmar Transferência
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Student History Modal */}
      {viewingStudentHistory && (
        <>
          {isFetchingCarne && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-slide-up">
              <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-800">
                <Loader2 size={20} className="animate-spin text-indigo-400" />
                <span className="font-bold text-sm tracking-tight">Buscando carnê...</span>
              </div>
            </div>
          )}
          {isDeletingBatch && (
            <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[100] animate-slide-up">
              <div className="bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-800">
                <Loader2 size={20} className="animate-spin text-red-400" />
                <span className="font-bold text-sm tracking-tight">Apagando parcelas...</span>
              </div>
            </div>
          )}
          <div className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-2xl w-full max-w-4xl h-[85vh] flex flex-col shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 border border-indigo-200">
                  {viewingStudentHistory.photo ? (
                    <img src={viewingStudentHistory.photo} alt={viewingStudentHistory.name} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <User size={24} />
                  )}
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">{viewingStudentHistory.name}</h3>
                  <p className="text-slate-500 text-sm font-medium">Histórico Financeiro e Contratual</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={closeHistoryModal} className="p-2 hover:bg-slate-100 rounded-full transition-colors">
                  <X size={24} className="text-slate-400" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              {/* Contracts Section */}
              <section>
                <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                  <span className="w-2 h-2 bg-indigo-500 rounded-full"></span> Contratos
                </h4>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase">Título</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase">Data de Criação</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.contracts.filter(c => c.studentId === viewingStudentHistory.id).length > 0 ? (
                        data.contracts.filter(c => c.studentId === viewingStudentHistory.id).map(contract => (
                          <tr key={contract.id} className="hover:bg-slate-50">
                            <td className="p-4 text-sm font-medium text-slate-700">{contract.title}</td>
                            <td className="p-4 text-sm text-slate-500">{new Date(contract.createdAt).toLocaleDateString()}</td>
                            <td className="p-4 text-right">
                              <button className="text-indigo-600 text-xs font-bold hover:underline">Ver Detalhes</button>
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={3} className="p-8 text-center text-slate-400 text-sm">Nenhum contrato encontrado.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

              {/* Payments Section */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 bg-emerald-500 rounded-full"></span> Histórico de Pagamentos
                  </h4>
                  <div className="flex items-center gap-2">
                    <button 
                      onClick={() => handlePrintCarne(viewingStudentHistory.id)}
                      disabled={isFetchingCarne}
                      className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-2 border border-indigo-100 disabled:opacity-50"
                    >
                      {isFetchingCarne ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
                      Imprimir Carnê Completo
                    </button>
                    {selectedPayments.length > 0 && (
                      <button 
                        onClick={() => setShowDeleteBatchModal(true)}
                        className="px-4 py-2 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg shadow-red-100 animate-in slide-in-from-right-4"
                      >
                        <Trash2 size={14} /> Apagar Selecionadas ({selectedPayments.length})
                      </button>
                    )}
                  </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                      <tr>
                        <th className="p-4 w-10">
                          <input 
                            type="checkbox" 
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                            onChange={(e) => {
                              const studentPayments = data.payments.filter(p => p.studentId === viewingStudentHistory.id && p.asaasPaymentId);
                              if (e.target.checked) {
                                setSelectedPayments(studentPayments.map(p => p.asaasPaymentId!));
                              } else {
                                setSelectedPayments([]);
                              }
                            }}
                            checked={
                              selectedPayments.length > 0 && 
                              selectedPayments.length === data.payments.filter(p => p.studentId === viewingStudentHistory.id && p.asaasPaymentId).length
                            }
                          />
                        </th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase">Descrição</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase">Vencimento</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase">Valor</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase">Status</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase">Data Pagamento</th>
                        <th className="p-4 text-xs font-bold text-slate-500 uppercase text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {data.payments.filter(p => p.studentId === viewingStudentHistory.id).length > 0 ? (
                        data.payments.filter(p => p.studentId === viewingStudentHistory.id).map(payment => (
                          <tr key={payment.id} className={`hover:bg-slate-50 transition-colors ${selectedPayments.includes(payment.asaasPaymentId || '') ? 'bg-indigo-50/50' : ''}`}>
                            <td className="p-4">
                              <input 
                                type="checkbox" 
                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                                checked={selectedPayments.includes(payment.asaasPaymentId || '')}
                                onChange={() => togglePaymentSelection(payment.asaasPaymentId || '')}
                                disabled={!payment.asaasPaymentId}
                              />
                            </td>
                            <td className="p-4 text-sm font-medium text-slate-700">
                              {payment.description || (payment.type === 'monthly' ? `Mensalidade ${payment.installmentNumber}/${payment.totalInstallments}` : 'Taxa')}
                            </td>
                            <td className="p-4 text-sm text-slate-500">{new Date(payment.dueDate).toLocaleDateString()}</td>
                            <td className="p-4 text-sm font-bold text-slate-700">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(payment.amount)}
                            </td>
                            <td className="p-4">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                                (payment.status === 'paid' || payment.status === 'received' || payment.status === 'confirmed') ? 'bg-emerald-100 text-emerald-700' :
                                payment.status === 'overdue' ? 'bg-red-100 text-red-700' :
                                'bg-amber-100 text-amber-700'
                              }`}>
                                {(payment.status === 'paid' || payment.status === 'received' || payment.status === 'confirmed') ? 'Pago' : payment.status === 'overdue' ? 'Atrasado' : 'Pendente'}
                              </span>
                            </td>
                            <td className="p-4 text-sm text-slate-500">
                              {payment.paidDate ? new Date(payment.paidDate).toLocaleDateString() : '-'}
                            </td>
                            <td className="p-4 text-right">
                              {payment.asaasPaymentId && (
                                <>
                                  {(payment.status === 'pending' || payment.status === 'overdue') && (
                                    <button 
                                      onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'boleto')}
                                      className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors inline-flex items-center gap-1.5"
                                    >
                                      <Barcode size={14} /> Boleto
                                    </button>
                                  )}
                                  {(payment.status === 'paid' || payment.status === 'received' || payment.status === 'confirmed') && (
                                    <button 
                                      onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'recibo')}
                                      className="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors inline-flex items-center gap-1.5 border border-emerald-100"
                                    >
                                      <Receipt size={14} /> Recibo
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">Nenhum pagamento registrado.</td>
                        </tr>
                      )}

                    </tbody>
                  </table>
                </div>
              </section>
            </div>
            
            <div className="px-8 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button 
                onClick={closeHistoryModal}
                className="px-6 py-2 bg-slate-200 text-slate-700 rounded-lg font-bold hover:bg-slate-300 transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      </>
    )}
      {/* Batch Delete Confirmation Modal */}
      {showDeleteBatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden animate-slide-up">
            <div className="bg-red-600 h-1.5 w-full"></div>
            <div className="p-8 text-center">
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <AlertCircle size={32} />
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2">Confirmar Exclusão</h3>
              <p className="text-slate-500 text-sm mb-8">
                Tem a certeza que deseja apagar as <strong>{selectedPayments.length}</strong> parcelas selecionadas? Esta ação não pode ser desfeita e irá cancelar as cobranças no Asaas.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowDeleteBatchModal(false)}
                  className="flex-1 py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button 
                  onClick={handleDeleteBatch}
                  disabled={isDeletingBatch}
                  className="flex-1 py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-100 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isDeletingBatch ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
                  {isDeletingBatch ? 'Apagando...' : 'Sim, Apagar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cancellation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-slide-up">
            <div className="bg-orange-500 h-1.5 w-full"></div>
            <div className="p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 bg-orange-100 text-orange-600 rounded-full flex items-center justify-center shrink-0">
                  <UserX size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800">Cancelar Matrícula</h3>
                  <p className="text-slate-500 text-sm">Cancelamento de {showDeleteModal.name}</p>
                </div>
              </div>
              
              <div className="space-y-4 mb-8">
                <p className="text-slate-600 text-sm">
                  O histórico do aluno será mantido, mas o status será alterado para <strong>Cancelado</strong>.
                </p>
                
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Motivo do Cancelamento *</label>
                  <textarea
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    className="w-full p-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 min-h-[100px] resize-none"
                    placeholder="Descreva o motivo do cancelamento..."
                    required
                  />
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => confirmCancellation(true)}
                  className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-2"
                >
                  <Printer size={18} />
                  Imprimir Termo e Cancelar
                </button>
                <button 
                  onClick={() => confirmCancellation(false)}
                  className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold hover:bg-orange-600 shadow-lg shadow-orange-100 transition-all flex items-center justify-center gap-2"
                >
                  <CheckCircle size={18} />
                  Apenas Cancelar Matrícula
                </button>
                <button 
                  onClick={() => {
                    setShowDeleteModal(null);
                    setCancellationReason('');
                  }}
                  className="w-full py-3 text-slate-500 font-bold hover:bg-slate-50 rounded-xl transition-colors mt-2"
                >
                  Voltar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FALLBACK CARNE MODAL */}
      {showFallbackModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-xl w-full max-w-3xl shadow-2xl my-auto relative overflow-hidden animate-slide-up">
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Carnê Digital</h3>
                <p className="text-sm text-slate-500 mt-1">O link único do carnê não está disponível. Você pode acessar os boletos individuais abaixo.</p>
              </div>
              <button onClick={() => setShowFallbackModal(false)} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90"><X size={24} /></button>
            </div>
            
            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {fallbackInstallments.map((parcela) => (
                  <div key={parcela.id} className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="text-xs font-black text-indigo-500 uppercase tracking-wider">Parcela {parcela.numero}</div>
                        <div className="text-lg font-bold text-slate-800 mt-0.5">R$ {parcela.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-slate-400 font-medium">Vencimento</div>
                        <div className="text-sm font-bold text-slate-700">{new Date(parcela.vencimento).toLocaleDateString('pt-BR')}</div>
                      </div>
                    </div>
                    
                    <div className="pt-3 border-t border-slate-100 flex justify-between items-center">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${
                        parcela.status === 'paid' || parcela.status === 'received' || parcela.status === 'confirmed' ? 'text-emerald-600 bg-emerald-50' :
                        parcela.status === 'overdue' ? 'text-red-600 bg-red-50' :
                        'text-amber-600 bg-amber-50'
                      }`}>
                        {parcela.status === 'paid' || parcela.status === 'received' || parcela.status === 'confirmed' ? 'Pago' :
                         parcela.status === 'overdue' ? 'Atrasado' : 'Pendente'}
                      </span>
                      
                      {parcela.linkBoleto ? (
                        <a 
                          href={parcela.linkBoleto} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors inline-flex items-center gap-1.5"
                        >
                          <Barcode size={14} /> Abrir Boleto
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 italic">Boleto indisponível</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button 
                type="button" 
                onClick={() => setShowFallbackModal(false)} 
                className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 rounded-xl transition-colors shadow-sm"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Students;
