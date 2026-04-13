import React, { useState, useEffect } from 'react';
import { SchoolData, Contract, Student, Payment } from '../types';
import { useDialog } from '../DialogContext';
import { Plus, Search, Trash2, X, User, Calendar, FileSignature, ListChecks, Printer, AlertTriangle, RefreshCw, Edit2, Info } from 'lucide-react';
import { pdfService } from '../services/pdfService';

interface ContractsProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const Contracts: React.FC<ContractsProps> = ({ data, updateData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [activeTab, setActiveTab] = useState<'contracts' | 'templates'>('contracts');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isTemplateModalOpen, setIsTemplateModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isGeneratingPDF, setIsGeneratingPDF] = useState<string | null>(null);
  
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [contractToGenerate, setContractToGenerate] = useState<Contract | null>(null);
  const [genConfig, setGenConfig] = useState({
    startDate: new Date().toLocaleDateString('pt-BR'),
    installments: 12,
    discount: 0
  });

  const [formData, setFormData] = useState<Omit<Contract, 'id' | 'createdAt'>>({
    studentId: '',
    title: '',
    content: ''
  });

  const [templateFormData, setTemplateFormData] = useState({
    id: '',
    name: '',
    content: ''
  });

  // Pre-load content when student is selected based on template
  useEffect(() => {
    if (formData.studentId && !formData.content) {
      const student = data.students.find(s => s.id === formData.studentId);
      const cls = data.classes.find(c => c.id === student?.classId);
      const course = data.courses.find(c => c.id === cls?.courseId);
      const templateObj = data.contractTemplates?.find(t => t.id === student?.contractTemplateId);
      
      if (student && course) {
        let template = templateObj?.content || '';
        
        // Aluno
        template = template.replace(/{{aluno}}/g, student.name || '');
        template = template.replace(/{{aluno_cpf}}/g, student.cpf || '');
        template = template.replace(/{{aluno_rg}}/g, student.rg || '');
        template = template.replace(/{{aluno_nascimento}}/g, student.birthDate ? new Date(student.birthDate).toLocaleDateString('pt-BR') : '');
        template = template.replace(/{{aluno_email}}/g, student.email || '');
        template = template.replace(/{{aluno_telefone}}/g, student.phone || '');
        template = template.replace(/{{aluno_cep}}/g, student.addressZip || '');
        template = template.replace(/{{aluno_endereco}}/g, `${student.addressStreet || ''}, ${student.addressNumber || ''}`);
        template = template.replace(/{{aluno_bairro}}/g, student.addressNeighborhood || '');
        template = template.replace(/{{aluno_cidade}}/g, student.addressCity || '');
        template = template.replace(/{{aluno_estado}}/g, student.addressState || '');

        // Responsável
        template = template.replace(/{{responsavel_nome}}/g, student.guardianName || '');
        template = template.replace(/{{responsavel_cpf}}/g, student.guardianCpf || '');
        template = template.replace(/{{responsavel_nascimento}}/g, student.guardianBirthDate ? new Date(student.guardianBirthDate).toLocaleDateString('pt-BR') : '');

        // Curso e Turma
        template = template.replace(/{{curso}}/g, course.name || '');
        template = template.replace(/{{mensalidade}}/g, course.monthlyFee ? `R$ ${course.monthlyFee.toFixed(2)}` : 'R$ 0,00');
        template = template.replace(/{{duracao}}/g, course.duration || '');
        template = template.replace(/{{curso_taxa_matricula}}/g, course.registrationFee ? `R$ ${course.registrationFee.toFixed(2)}` : 'R$ 0,00');
        template = template.replace(/{{turma_nome}}/g, cls?.name || '');
        template = template.replace(/{{turma_professor}}/g, cls?.teacher || '');
        template = template.replace(/{{turma_horario}}/g, cls?.schedule || '');

        // Escola
        template = template.replace(/{{data}}/g, new Date().toLocaleDateString('pt-BR'));
        template = template.replace(/{{escola}}/g, data.profile.name || '');
        template = template.replace(/{{cnpj_escola}}/g, data.profile.cnpj || '');
        
        setFormData(prev => ({ 
          ...prev, 
          content: template,
          title: prev.title || `Contrato de Matrícula - ${student.name}`
        }));
      }
    }
  }, [formData.studentId, data]);

  const filteredContracts = data.contracts.filter(c => {
    const student = data.students.find(s => s.id === c.studentId);
    const search = (searchTerm || '').toLowerCase();
    return (c.title || '').toLowerCase().includes(search) || (student?.name || '').toLowerCase().includes(search);
  });

  const filteredTemplates = (data.contractTemplates || []).filter(t => 
    (t.name || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.studentId || !formData.title || !formData.content) {
      showAlert('Atenção', '⚠️ Por favor, selecione um aluno e preencha o título e conteúdo do contrato.', 'warning');
      return;
    }

    const newContract: Contract = {
      ...formData,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    updateData({ contracts: [...data.contracts, newContract] });
    closeModal();
  };

  const handleTemplateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateFormData.name || !templateFormData.content) {
      showAlert('Atenção', '⚠️ Preencha o nome e o conteúdo do modelo.', 'warning');
      return;
    }

    const templates = data.contractTemplates || [];
    let updatedTemplates;

    if (templateFormData.id) {
      updatedTemplates = templates.map(t => t.id === templateFormData.id ? templateFormData : t);
    } else {
      updatedTemplates = [...templates, { ...templateFormData, id: crypto.randomUUID() }];
    }

    updateData({ contractTemplates: updatedTemplates });
    closeTemplateModal();
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setShowGenerateModal(false);
      setIsClosing(false);
      setFormData({ studentId: '', title: '', content: '' });
      setContractToGenerate(null);
    }, 400);
  };

  const closeTemplateModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsTemplateModalOpen(false);
      setIsClosing(false);
      setTemplateFormData({ id: '', name: '', content: '' });
    }, 400);
  };

  const handleDelete = (id: string) => {
    showConfirm(
      'Excluir Contrato', 
      'Tem certeza que deseja excluir este contrato?',
      () => {
        updateData({ contracts: data.contracts.filter(c => c.id !== id) });
      }
    );
  };

  const handleDeleteTemplate = (id: string) => {
    showConfirm(
      'Excluir Modelo', 
      'Tem certeza que deseja excluir este modelo de contrato?',
      () => {
        updateData({ contractTemplates: (data.contractTemplates || []).filter(t => t.id !== id) });
      }
    );
  };

  const handleDownloadContract = async (contract: Contract, student: Student) => {
    setIsGeneratingPDF(contract.id);
    try {
      await pdfService.generateContractPDF(contract, student, data);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGeneratingPDF(null);
    }
  };

  const openGenerateModal = (contract: Contract) => {
    const student = data.students.find(s => s.id === contract.studentId);
    const cls = data.classes.find(c => c.id === student?.classId);
    const course = data.courses.find(c => c.id === cls?.courseId);
    
    if (student && cls && course) {
      setContractToGenerate(contract);
      setGenConfig({
        startDate: new Date().toLocaleDateString('pt-BR'),
        installments: course.durationMonths || 12,
        discount: 0
      });
      setShowGenerateModal(true);
    } else {
      console.warn("Missing data for generation");
    }
  };

  const handleGenerate = () => {
    if (!contractToGenerate) return;
    
    const contract = contractToGenerate;
    const student = data.students.find(s => s.id === contract.studentId);
    const cls = data.classes.find(c => c.id === student?.classId);
    const course = data.courses.find(c => c.id === cls?.courseId);

    if (!course || !student) return;

    // Parse date from DD/MM/YYYY
    const [d, m, y] = genConfig.startDate.split('/');
    const startDate = new Date(`${y}-${m}-${d}`);
    const newPayments: Payment[] = [];

    for (let i = 0; i < genConfig.installments; i++) {
      const dueDate = new Date(startDate);
      dueDate.setMonth(startDate.getMonth() + i);

      const finalAmount = Math.max(0, course.monthlyFee - genConfig.discount);

      newPayments.push({
        id: crypto.randomUUID(),
        studentId: student.id,
        contractId: contract.id,
        amount: finalAmount,
        discount: genConfig.discount,
        dueDate: dueDate.toISOString().split('T')[0],
        status: 'pending',
        type: 'monthly',
        installmentNumber: i + 1,
        totalInstallments: genConfig.installments,
        description: `Parcela ${i + 1}/${genConfig.installments} - ${course.name}${genConfig.discount > 0 ? ` (Desc: R$ ${genConfig.discount})` : ''}`
      });
    }

    updateData({ payments: [...data.payments, ...newPayments] });
    closeModal();
  };

  const formatDateMask = (val: string) => {
    return val.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 10);
  };

  const inputClass = "w-full px-4 py-3 bg-white text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Contratos</h2>
          <p className="text-slate-500 text-sm">Gestão de termos de adesão e modelos de contrato.</p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          <button 
            onClick={() => {
              setTemplateFormData({ id: '', name: '', content: '' });
              setIsTemplateModalOpen(true);
            }} 
            className="flex-1 sm:flex-none bg-white border border-slate-200 text-slate-700 px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm font-bold"
          >
            <Plus size={20} /> Novo Modelo
          </button>
          <button 
            onClick={() => setIsModalOpen(true)} 
            className="flex-1 sm:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg font-bold"
          >
            <Plus size={20} /> Novo Contrato
          </button>
        </div>
      </div>

      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('contracts')}
          className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'contracts' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Contratos Emitidos
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-6 py-3 font-bold text-sm transition-all border-b-2 ${activeTab === 'templates' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Modelos de Contrato
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/30">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input type="text" placeholder={activeTab === 'contracts' ? "Buscar por título ou aluno..." : "Buscar por nome do modelo..."} className={`${inputClass} pl-12`} value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
          </div>
        </div>

        {activeTab === 'contracts' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Documento / Beneficiário</th>
                  <th className="px-6 py-4">Data Emissão</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContracts.map(contract => {
                  const student = data.students.find(s => s.id === contract.studentId);
                  const hasPayments = data.payments.some(p => p.contractId === contract.id);
                  return (
                    <tr key={contract.id} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="px-6 py-5">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-xl ${hasPayments ? 'bg-emerald-50 text-emerald-600' : 'bg-indigo-50 text-indigo-600'}`}><FileSignature size={24} /></div>
                          <div>
                            <div className="font-bold text-slate-900">{contract.title}</div>
                            <div className="text-xs text-slate-500 flex items-center gap-1 mt-1"><User size={12} /> {student?.name || 'Aluno Removido'} {hasPayments && <span className="ml-2 text-emerald-600 font-bold flex items-center gap-1"><ListChecks size={12}/> Financeiro Gerado</span>}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-slate-600 text-sm font-medium"><div className="flex items-center gap-2"><Calendar size={16} className="text-slate-400" /> {new Date(contract.createdAt).toLocaleDateString('pt-BR')}</div></td>
                      <td className="px-6 py-5 text-right flex justify-end gap-2">
                        <button 
                          onClick={() => handleDownloadContract(contract, student!)} 
                          disabled={isGeneratingPDF === contract.id}
                          className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-xl transition-all shadow-sm disabled:opacity-50" 
                          title="Imprimir Contrato"
                        >
                          {isGeneratingPDF === contract.id ? (
                            <RefreshCw size={20} className="animate-spin" />
                          ) : (
                            <Printer size={20} />
                          )}
                        </button>
                        <button onClick={() => handleDelete(contract.id)} className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-red-600 rounded-xl transition-all shadow-sm" title="Excluir"><Trash2 size={20} /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-bold tracking-wider">
                <tr>
                  <th className="px-6 py-4">Nome do Modelo</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTemplates.map(template => (
                  <tr key={template.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-indigo-50 text-indigo-600"><FileSignature size={24} /></div>
                        <div className="font-bold text-slate-900">{template.name}</div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right flex justify-end gap-2">
                      <button 
                        onClick={() => {
                          setTemplateFormData(template);
                          setIsTemplateModalOpen(true);
                        }} 
                        className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-indigo-600 rounded-xl transition-all shadow-sm" 
                        title="Editar Modelo"
                      >
                        <Edit2 size={20} />
                      </button>
                      <button onClick={() => handleDeleteTemplate(template.id)} className="p-3 bg-white border border-slate-200 text-slate-400 hover:text-red-600 rounded-xl transition-all shadow-sm" title="Excluir"><Trash2 size={20} /></button>
                    </td>
                  </tr>
                ))}
                {filteredTemplates.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-6 py-10 text-center text-slate-400 italic">Nenhum modelo de contrato encontrado.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* CREATE CONTRACT MODAL */}
      {isModalOpen && (
        <div className={`fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-2xl w-full max-w-2xl overflow-hidden shadow-2xl transition-all duration-400 ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="h-2 bg-indigo-600 w-full"></div>
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div><h3 className="text-2xl font-black text-slate-800 tracking-tight">Criar Contrato Manual</h3><p className="text-sm text-slate-500">O conteúdo será preenchido pelo modelo vinculado ao aluno.</p></div>
              <button onClick={closeModal} className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-xl shadow-sm transition-all hover:rotate-90"><X size={24} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <select required className={inputClass} value={formData.studentId} onChange={e => setFormData({...formData, studentId: e.target.value})}>
                  <option value="">Selecione o Aluno...</option>
                  {data.students.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <input required placeholder="Título do Documento" className={inputClass} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
              </div>
              <textarea required rows={10} placeholder="Conteúdo do Contrato..." className={`${inputClass} font-serif text-sm leading-relaxed resize-none`} value={formData.content} onChange={e => setFormData({...formData, content: e.target.value})} />
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={closeModal} className="flex-1 px-6 py-4 border border-slate-200 rounded-xl text-slate-600 font-bold">Cancelar</button>
                <button type="submit" className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-xl shadow-lg font-bold">Salvar Contrato</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE/EDIT TEMPLATE MODAL */}
      {isTemplateModalOpen && (
        <div className={`fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-2xl w-full max-w-3xl overflow-hidden shadow-2xl transition-all duration-400 ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="h-2 bg-indigo-600 w-full"></div>
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div><h3 className="text-2xl font-black text-slate-800 tracking-tight">{templateFormData.id ? 'Editar Modelo' : 'Novo Modelo de Contrato'}</h3><p className="text-sm text-slate-500">Defina as cláusulas e use placeholders para dados dinâmicos.</p></div>
              <button onClick={closeTemplateModal} className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-xl shadow-sm transition-all hover:rotate-90"><X size={24} /></button>
            </div>
            <form onSubmit={handleTemplateSubmit} className="p-8 space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Nome do Modelo</label>
                <input required placeholder="Ex: Contrato de Matrícula Padrão" className={inputClass} value={templateFormData.name} onChange={e => setTemplateFormData({...templateFormData, name: e.target.value})} />
              </div>
              
              <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg flex gap-3">
                <Info className="text-amber-500 shrink-0" size={20} />
                <div className="text-xs text-amber-800 space-y-2">
                  <p className="font-bold">Placeholders Disponíveis:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                    <p><code className="bg-white px-1 rounded">{"{{aluno}}"}</code>, <code className="bg-white px-1 rounded">{"{{aluno_cpf}}"}</code>, <code className="bg-white px-1 rounded">{"{{aluno_rg}}"}</code></p>
                    <p><code className="bg-white px-1 rounded">{"{{responsavel_nome}}"}</code>, <code className="bg-white px-1 rounded">{"{{responsavel_cpf}}"}</code></p>
                    <p><code className="bg-white px-1 rounded">{"{{curso}}"}</code>, <code className="bg-white px-1 rounded">{"{{mensalidade}}"}</code>, <code className="bg-white px-1 rounded">{"{{duracao}}"}</code></p>
                    <p><code className="bg-white px-1 rounded">{"{{escola}}"}</code>, <code className="bg-white px-1 rounded">{"{{cnpj_escola}}"}</code>, <code className="bg-white px-1 rounded">{"{{data}}"}</code></p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5 ml-1">Conteúdo do Contrato</label>
                <textarea required rows={12} placeholder="Digite as cláusulas do contrato..." className={`${inputClass} font-serif text-sm leading-relaxed resize-none`} value={templateFormData.content} onChange={e => setTemplateFormData({...templateFormData, content: e.target.value})} />
              </div>
              
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={closeTemplateModal} className="flex-1 px-6 py-4 border border-slate-200 rounded-xl text-slate-600 font-bold">Cancelar</button>
                <button type="submit" className="flex-1 px-6 py-4 bg-indigo-600 text-white rounded-xl shadow-lg font-bold">Salvar Modelo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GENERATE INSTALLMENTS MODAL */}
      {showGenerateModal && (
        <div className={`fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-2xl w-full max-w-md overflow-hidden shadow-2xl transition-all duration-400 ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="h-2 bg-emerald-600 w-full"></div>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-emerald-50">
              <div><h3 className="text-xl font-black text-slate-800">Gerar Financeiro</h3></div>
              <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-600"><X size={20}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Data 1ª Parcela</label>
                <input className={inputClass} value={genConfig.startDate} onChange={e => setGenConfig({...genConfig, startDate: formatDateMask(e.target.value)})} placeholder="DD/MM/AAAA" maxLength={10} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Qtd. Parcelas</label>
                <input type="number" className={inputClass} value={genConfig.installments} onChange={e => setGenConfig({...genConfig, installments: parseInt(e.target.value) || 0})} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Desconto Mensal (R$)</label>
                <input type="number" className={inputClass} value={genConfig.discount} onChange={e => setGenConfig({...genConfig, discount: parseFloat(e.target.value)})} />
              </div>
              <div className="pt-2 flex gap-3">
                <button onClick={closeModal} className="flex-1 py-3 border border-slate-200 rounded-lg font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                <button onClick={handleGenerate} className="flex-1 py-3 bg-emerald-600 text-white rounded-lg font-bold hover:bg-emerald-700">Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Contracts;