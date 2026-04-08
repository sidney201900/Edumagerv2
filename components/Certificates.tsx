import React, { useState, useRef, useEffect } from 'react';
import { SchoolData, Certificate, Student, CertificateTemplate, TextOverlay } from '../types';
import { dbService } from '../services/dbService';
import { useDialog } from '../DialogContext';
import { Award, Upload, Search, Trash2, Download, Eye, X, Image as ImageIcon, Edit2, Save, Type, Move, Palette, Baseline, Layout, Copy, Check, Plus } from 'lucide-react';
import jsPDF from 'jspdf';

interface CertificatesProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const Certificates: React.FC<CertificatesProps> = ({ data, updateData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [description, setDescription] = useState('');
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [previewCertificate, setPreviewCertificate] = useState<Certificate | null>(null);
  const [editingCertificate, setEditingCertificate] = useState<Certificate | null>(null);
  const [activeTab, setActiveTab] = useState<'front' | 'back'>('front');
  const [templateName, setTemplateName] = useState('');
  const [showTemplateModal, setShowTemplateModal] = useState(false);

  // Overlays States
  const [frontOverlays, setFrontOverlays] = useState<TextOverlay[]>([]);
  const [backOverlays, setBackOverlays] = useState<TextOverlay[]>([]);
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);

  const fileInputFrontRef = useRef<HTMLInputElement>(null);
  const fileInputBackRef = useRef<HTMLInputElement>(null);

  const activeOverlays = activeTab === 'front' ? frontOverlays : backOverlays;
  const setActiveOverlays = activeTab === 'front' ? setFrontOverlays : setBackOverlays;
  const selectedOverlay = activeOverlays.find(o => o.id === selectedOverlayId);

  const handleAddOverlay = () => {
    const newOverlay: TextOverlay = {
      id: crypto.randomUUID(),
      text: activeTab === 'front' ? 'Certificamos que {{aluno}}...' : 'Conteúdo do verso...',
      x: 50,
      y: 50,
      fontSize: activeTab === 'front' ? 24 : 12,
      color: '#000000'
    };
    setActiveOverlays([...activeOverlays, newOverlay]);
    setSelectedOverlayId(newOverlay.id);
  };

  const handleUpdateOverlay = (id: string, updates: Partial<TextOverlay>) => {
    setActiveOverlays(activeOverlays.map(o => o.id === id ? { ...o, ...updates } : o));
  };

  const handleRemoveOverlay = (id: string) => {
    setActiveOverlays(activeOverlays.filter(o => o.id !== id));
    if (selectedOverlayId === id) setSelectedOverlayId(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, side: 'front' | 'back') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (side === 'front') setFrontImage(reader.result as string);
        else setBackImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSaveCertificate = () => {
    if (!selectedStudentId || !frontImage) {
      showAlert('Atenção', '⚠️ Por favor, selecione um aluno e faça upload da imagem da frente.', 'warning');
      return;
    }

    const certificateData: Certificate = {
      id: editingCertificate ? editingCertificate.id : crypto.randomUUID(),
      studentId: selectedStudentId,
      description,
      frontImage,
      backImage: backImage || undefined,
      issueDate: editingCertificate ? editingCertificate.issueDate : new Date().toISOString(),
      frontOverlays,
      backOverlays
    };

    let updatedCertificates;
    if (editingCertificate) {
      updatedCertificates = (data.certificates || []).map(c => c.id === editingCertificate.id ? certificateData : c);
    } else {
      updatedCertificates = [...(data.certificates || []), certificateData];
    }

    updateData({ certificates: updatedCertificates });
    dbService.saveData({ ...data, certificates: updatedCertificates });

    resetForm();
    showAlert('Sucesso', editingCertificate ? '✅ Certificado atualizado!' : '✅ Certificado salvo com sucesso!', 'success');
  };

  const handleSaveTemplate = () => {
    if (!templateName || !frontImage) {
      showAlert('Atenção', '⚠️ Informe um nome para o modelo e carregue pelo menos a imagem da frente.', 'warning');
      return;
    }

    const newTemplate: CertificateTemplate = {
      id: crypto.randomUUID(),
      name: templateName,
      frontImage,
      backImage: backImage || undefined,
      frontOverlays,
      backOverlays
    };

    const updatedTemplates = [...(data.certificateTemplates || []), newTemplate];
    updateData({ certificateTemplates: updatedTemplates });
    dbService.saveData({ ...data, certificateTemplates: updatedTemplates });
    
    setTemplateName('');
    setShowTemplateModal(false);
    showAlert('Sucesso', '✅ Modelo salvo com sucesso!', 'success');
  };

  const loadTemplate = (template: CertificateTemplate) => {
    setFrontImage(template.frontImage);
    setBackImage(template.backImage);
    setFrontOverlays(template.frontOverlays || []);
    setBackOverlays(template.backOverlays || []);
    setSelectedOverlayId(null);
    showAlert('Modelo Carregado', `✅ Modelo "${template.name}" carregado!`, 'success');
  };

  const resetForm = () => {
    setSelectedStudentId('');
    setDescription('');
    setFrontImage(null);
    setBackImage(null);
    setFrontOverlays([]);
    setBackOverlays([]);
    setSelectedOverlayId(null);
    setEditingCertificate(null);
    if (fileInputFrontRef.current) fileInputFrontRef.current.value = '';
    if (fileInputBackRef.current) fileInputBackRef.current.value = '';
  };

  const handleEditCertificate = (cert: Certificate) => {
    setEditingCertificate(cert);
    setSelectedStudentId(cert.studentId);
    setDescription(cert.description || '');
    setFrontImage(cert.frontImage);
    setBackImage(cert.backImage);
    setFrontOverlays(cert.frontOverlays || []);
    setBackOverlays(cert.backOverlays || []);
    setSelectedOverlayId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteCertificate = (id: string) => {
    showConfirm(
      'Excluir Certificado', 
      '⚠️ Tem certeza que deseja excluir este certificado?',
      () => {
        const updatedCertificates = (data.certificates || []).filter(c => c.id !== id);
        updateData({ certificates: updatedCertificates });
        dbService.saveData({ ...data, certificates: updatedCertificates });
      }
    );
  };

  const handleDeleteTemplate = (id: string) => {
    showConfirm(
      'Excluir Modelo', 
      '⚠️ Excluir este modelo?',
      () => {
        const updatedTemplates = (data.certificateTemplates || []).filter(t => t.id !== id);
        updateData({ certificateTemplates: updatedTemplates });
        dbService.saveData({ ...data, certificateTemplates: updatedTemplates });
      }
    );
  };

  const getStudentStats = (studentId: string) => {
    const studentGrades = (data.grades || []).filter(g => g.studentId === studentId);
    const media = studentGrades.length > 0 
      ? (studentGrades.reduce((acc, curr) => acc + curr.value, 0) / studentGrades.length).toFixed(1)
      : '0.0';

    const studentAttendance = (data.attendance || []).filter(a => a.studentId === studentId);
    const presences = studentAttendance.filter(a => a.type === 'presence').length;
    const frequencia = studentAttendance.length > 0
      ? ((presences / studentAttendance.length) * 100).toFixed(0)
      : '0';

    return { media, frequencia };
  };

  const handleDownloadPDF = (cert: Certificate) => {
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });

    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();
    const student = data.students.find(s => s.id === cert.studentId);
    const studentName = student?.name || 'Aluno';
    const { media, frequencia } = getStudentStats(cert.studentId);
    const historico = (data.grades || [])
      .filter(g => g.studentId === cert.studentId)
      .map(g => {
        const subject = data.subjects.find(s => s.id === g.subjectId);
        return `${subject?.name || 'Disciplina'}: ${g.value}`;
      })
      .join('\n');

    // Helper to draw wrapped text
    const drawWrappedText = (text: string, xPerc: number, yPerc: number, fSize: number, color: string) => {
      const processedText = text
        .replace(/{{aluno}}/gi, studentName)
        .replace(/{{media}}/gi, media)
        .replace(/{{frequencia}}/gi, `${frequencia}%`)
        .replace(/{{historico}}/gi, historico);
        
      doc.setTextColor(color);
      doc.setFontSize(fSize);
      
      const xPos = (xPerc / 100) * width;
      const yPos = (yPerc / 100) * height;
      
      const maxW = width * 0.8; // 80% of page width
      const lines = doc.splitTextToSize(processedText, maxW);
      doc.text(lines, xPos, yPos, { align: 'center' });
    };

    // Front
    doc.addImage(cert.frontImage, 'JPEG', 0, 0, width, height);
    (cert.frontOverlays || []).forEach(o => {
      drawWrappedText(o.text, o.x, o.y, o.fontSize, o.color);
    });
    
    // Back (Only if has back image or back overlays)
    if (cert.backImage || (cert.backOverlays && cert.backOverlays.length > 0)) {
      doc.addPage();
      if (cert.backImage) {
        doc.addImage(cert.backImage, 'JPEG', 0, 0, width, height);
      }
      (cert.backOverlays || []).forEach(o => {
        drawWrappedText(o.text, o.x, o.y, o.fontSize, o.color);
      });
    }

    doc.save(`Certificado_${studentName.replace(/\s+/g, '_')}.pdf`);
  };

  const filteredCertificates = (data.certificates || []).filter(cert => {
    const student = data.students.find(s => s.id === cert.studentId);
    return (student?.name || '').toLowerCase().includes((searchTerm || '').toLowerCase());
  });

  const currentStudentName = data.students.find(s => s.id === selectedStudentId)?.name || 'Nome do Aluno';
  const { media: currentMedia, frequencia: currentFrequencia } = getStudentStats(selectedStudentId);
  const currentHistorico = (data.grades || [])
    .filter(g => g.studentId === selectedStudentId)
    .map(g => {
      const subject = data.subjects.find(s => s.id === g.subjectId);
      return `${subject?.name || 'Disciplina'}: ${g.value}`;
    })
    .join('\n') || 'Matemática: 9.5\nPortuguês: 8.0\nHistória: 10.0';

  const processPreviewText = (text: string) => {
    return text
      .replace(/{{aluno}}/gi, currentStudentName)
      .replace(/{{media}}/gi, currentMedia)
      .replace(/{{frequencia}}/gi, `${currentFrequencia}%`)
      .replace(/{{historico}}/gi, currentHistorico);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Certificados</h2>
          <p className="text-slate-500 font-medium">Gerencie, edite e emita certificados personalizados.</p>
        </div>
        <div className="flex gap-2">
          {editingCertificate && (
            <button 
              onClick={resetForm}
              className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors font-bold text-sm flex items-center gap-2"
            >
              <X size={18} /> Cancelar Edição
            </button>
          )}
          <button 
            onClick={() => setShowTemplateModal(true)}
            className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-colors font-bold text-sm flex items-center gap-2"
          >
            <Layout size={18} /> Modelos Salvos
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">
        {/* Form & Preview Section */}
        <div className="xl:col-span-8 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3 text-indigo-600">
                <div className="p-2 bg-indigo-50 rounded-lg">
                  <Award size={20} />
                </div>
                <h3 className="text-lg font-black text-slate-800">
                  {editingCertificate ? 'Editar Certificado' : 'Novo Certificado'}
                </h3>
              </div>
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button 
                  onClick={() => setActiveTab('front')}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'front' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  FRENTE
                </button>
                <button 
                  onClick={() => setActiveTab('back')}
                  className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'back' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                >
                  VERSO
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Aluno</label>
                  <select 
                    className="w-full px-4 py-3 bg-slate-50 text-black border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm font-medium"
                    value={selectedStudentId}
                    onChange={(e) => setSelectedStudentId(e.target.value)}
                  >
                    <option value="">Selecione um aluno...</option>
                    {data.students
                      .filter(s => s.status === 'active')
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map(student => (
                      <option key={student.id} value={student.id}>{student.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Descrição Interna</label>
                  <input 
                    type="text"
                    className="w-full px-4 py-3 bg-slate-50 text-black border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    placeholder="Ex: Conclusão de Curso 2024"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Textos ({activeTab === 'front' ? 'Frente' : 'Verso'})</h4>
                    <button 
                      onClick={handleAddOverlay}
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all font-bold text-[10px] flex items-center gap-1.5"
                    >
                      <Plus size={14} /> Adicionar Texto
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                    {activeOverlays.map((overlay, index) => (
                      <div 
                        key={overlay.id} 
                        className={`p-4 rounded-2xl border transition-all space-y-4 ${selectedOverlayId === overlay.id ? 'border-indigo-500 bg-indigo-50/30 ring-2 ring-indigo-100' : 'border-slate-100 bg-slate-50'}`}
                        onClick={() => setSelectedOverlayId(overlay.id)}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Texto #{index + 1}</span>
                          <button 
                            onClick={(e) => { e.stopPropagation(); handleRemoveOverlay(overlay.id); }}
                            className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>

                        <div className="space-y-4">
                          <div>
                            <div className="flex justify-between items-end mb-1.5 ml-1">
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Conteúdo</label>
                              <span className="text-[9px] text-indigo-500 font-bold">Variáveis: {"{{aluno}}"}, {"{{media}}"}, {"{{frequencia}}"}, {"{{historico}}"}</span>
                            </div>
                            <textarea 
                              className="w-full px-4 py-3 bg-white text-black border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm min-h-[80px]"
                              value={overlay.text}
                              onChange={(e) => handleUpdateOverlay(overlay.id, { text: e.target.value })}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1">
                                <Baseline size={12} /> Fonte
                              </label>
                              <input type="number" className="w-full px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm" value={overlay.fontSize} onChange={(e) => handleUpdateOverlay(overlay.id, { fontSize: parseInt(e.target.value) || 0 })} />
                            </div>
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1">
                                <Palette size={12} /> Cor
                              </label>
                              <input type="color" className="h-11 w-full p-1 bg-white border border-slate-200 rounded-xl cursor-pointer" value={overlay.color} onChange={(e) => handleUpdateOverlay(overlay.id, { color: e.target.value })} />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1 flex items-center gap-1">
                              <Move size={12} /> Posição (X: {overlay.x}% | Y: {overlay.y}%)
                            </label>
                            <div className="space-y-4 px-2">
                              <input type="range" min="0" max="100" value={overlay.x} onChange={(e) => handleUpdateOverlay(overlay.id, { x: parseInt(e.target.value) || 0 })} className="w-full accent-indigo-600" />
                              <input type="range" min="0" max="100" value={overlay.y} onChange={(e) => handleUpdateOverlay(overlay.id, { y: parseInt(e.target.value) || 0 })} className="w-full accent-indigo-600" />
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {activeOverlays.length === 0 && (
                      <div className="py-8 text-center text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-2xl">
                        Nenhum texto adicionado. Clique em "Adicionar Texto".
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4">
                  {/* Front Image Upload */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Frente do Certificado</label>
                    <div 
                      className={`aspect-[1.414/1] rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center relative overflow-hidden group bg-slate-50 ${activeTab === 'front' ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-300'}`}
                      onClick={() => fileInputFrontRef.current?.click()}
                    >
                      {frontImage ? (
                        <>
                          <img src={frontImage} alt="Frente" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs">Alterar Frente</div>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="text-slate-400 mb-2" size={32} />
                          <span className="text-xs font-bold text-slate-500 uppercase">Upload Frente</span>
                        </>
                      )}
                      <input type="file" ref={fileInputFrontRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'front')} />
                    </div>
                  </div>

                  {/* Back Image Upload */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Verso do Certificado</label>
                    <div 
                      className={`aspect-[1.414/1] rounded-2xl border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center relative overflow-hidden group bg-slate-50 ${activeTab === 'back' ? 'border-indigo-500 ring-4 ring-indigo-50' : 'border-slate-300'}`}
                      onClick={() => fileInputBackRef.current?.click()}
                    >
                      {backImage ? (
                        <>
                          <img src={backImage} alt="Verso" className="w-full h-full object-cover" />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white font-bold text-xs">Alterar Verso</div>
                        </>
                      ) : (
                        <>
                          <ImageIcon className="text-slate-400 mb-2" size={32} />
                          <span className="text-xs font-bold text-slate-500 uppercase">Upload Verso</span>
                        </>
                      )}
                      <input type="file" ref={fileInputBackRef} className="hidden" accept="image/*" onChange={(e) => handleImageUpload(e, 'back')} />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 flex gap-4">
              <button 
                onClick={() => setShowTemplateModal(true)}
                className="flex-1 py-4 bg-white border-2 border-indigo-100 text-indigo-600 rounded-2xl hover:bg-indigo-50 transition-all font-black text-lg flex items-center justify-center gap-2"
              >
                <Copy size={24} /> Salvar como Modelo
              </button>
              <button 
                onClick={handleSaveCertificate}
                className="flex-[2] py-4 bg-indigo-600 text-white rounded-2xl hover:bg-indigo-700 transition-all shadow-xl shadow-indigo-100 font-black text-lg flex items-center justify-center gap-2 active:scale-95"
              >
                {editingCertificate ? <Save size={24} /> : <Upload size={24} />}
                {editingCertificate ? 'Atualizar Certificado' : 'Salvar Certificado'}
              </button>
            </div>
          </div>

          {/* Visual Preview Montage */}
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl space-y-4">
            <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
              <Eye size={20} className="text-indigo-600" /> Pré-visualização ({activeTab === 'front' ? 'FRENTE' : 'VERSO'})
            </h3>
            <div className="relative aspect-[1.414/1] w-full bg-slate-100 rounded-xl overflow-hidden shadow-inner border border-slate-200">
              {activeTab === 'front' ? (
                <>
                  {frontImage ? <img src={frontImage} alt="Preview Front" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold">Carregue a imagem da frente</div>}
                  {frontOverlays.map(o => (
                    <div 
                      key={o.id}
                      className={`absolute pointer-events-none text-center transform -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap ${selectedOverlayId === o.id ? 'ring-2 ring-indigo-500 ring-offset-2 rounded px-1' : ''}`}
                      style={{
                        left: `${o.x}%`,
                        top: `${o.y}%`,
                        fontSize: `${o.fontSize}px`,
                        color: o.color,
                        width: '80%',
                        fontWeight: 'bold',
                        textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}
                    >
                      {processPreviewText(o.text)}
                    </div>
                  ))}
                </>
              ) : (
                <>
                  {backImage ? <img src={backImage} alt="Preview Back" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-slate-400 font-bold">Carregue a imagem do verso</div>}
                  {backOverlays.map(o => (
                    <div 
                      key={o.id}
                      className={`absolute pointer-events-none text-center transform -translate-x-1/2 -translate-y-1/2 whitespace-pre-wrap ${selectedOverlayId === o.id ? 'ring-2 ring-indigo-500 ring-offset-2 rounded px-1' : ''}`}
                      style={{
                        left: `${o.x}%`,
                        top: `${o.y}%`,
                        fontSize: `${o.fontSize}px`,
                        color: o.color,
                        width: '80%',
                        fontWeight: 'bold',
                        textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                      }}
                    >
                      {processPreviewText(o.text)}
                    </div>
                  ))}
                </>
              )}
              <div className="absolute bottom-4 right-4 bg-black/50 backdrop-blur-md text-white text-[10px] font-bold px-3 py-1.5 rounded-full uppercase">
                {activeTab} (MODO EDIÇÃO)
              </div>
            </div>
          </div>
        </div>

        {/* List Section */}
        <div className="xl:col-span-4 space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xl h-full flex flex-col">
            <div className="flex items-center gap-4 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input 
                  type="text" 
                  placeholder="Buscar certificados..." 
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
              {filteredCertificates.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <Award size={48} className="mx-auto mb-4 opacity-20" />
                  <p className="font-medium">Nenhum certificado.</p>
                </div>
              ) : (
                filteredCertificates.map(cert => {
                  const student = data.students.find(s => s.id === cert.studentId);
                  return (
                    <div key={cert.id} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-indigo-200 transition-all group relative">
                      <div className="flex items-center gap-4 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold shrink-0"><Award size={20} /></div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-slate-800 truncate">{student?.name || 'Aluno Removido'}</h4>
                          <p className="text-[10px] text-slate-500 font-medium">Emitido: {new Date(cert.issueDate).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleDownloadPDF(cert)} className="flex-1 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-[10px] font-bold flex items-center justify-center gap-1"><Download size={14} /> PDF</button>
                        <button onClick={() => handleEditCertificate(cert)} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar"><Edit2 size={16} /></button>
                        <button onClick={() => handleDeleteCertificate(cert.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* TEMPLATE MODAL */}
      {showTemplateModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] my-auto animate-slide-up">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-xl font-black text-slate-800">Modelos de Certificado</h3>
                <p className="text-xs text-slate-500">Salve ou carregue configurações pré-definidas.</p>
              </div>
              <button onClick={() => setShowTemplateModal(false)} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-xl shadow-sm transition-all"><X size={20} /></button>
            </div>
            
            <div className="p-6 space-y-6 overflow-y-auto">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-4">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Salvar Configuração Atual</h4>
                <div className="flex gap-2">
                  <input 
                    type="text" 
                    placeholder="Nome do modelo (ex: Curso Informática)" 
                    className="flex-1 px-4 py-3 bg-white border border-slate-200 rounded-xl text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                  />
                  <button onClick={handleSaveTemplate} className="px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all flex items-center gap-2">
                    <Save size={18} /> Salvar
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest ml-1">Modelos Disponíveis</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(data.certificateTemplates || []).map(template => (
                    <div key={template.id} className="p-4 bg-white border border-slate-200 rounded-2xl hover:border-indigo-300 transition-all group flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-800 truncate">{template.name}</span>
                        <button onClick={() => handleDeleteTemplate(template.id)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={16} /></button>
                      </div>
                      <button 
                        onClick={() => { loadTemplate(template); setShowTemplateModal(false); }}
                        className="w-full py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 transition-all font-bold text-xs flex items-center justify-center gap-2"
                      >
                        <Check size={14} /> Carregar Modelo
                      </button>
                    </div>
                  ))}
                  {(data.certificateTemplates || []).length === 0 && (
                    <div className="col-span-full py-8 text-center text-slate-400 italic text-sm">Nenhum modelo salvo ainda.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Certificates;


