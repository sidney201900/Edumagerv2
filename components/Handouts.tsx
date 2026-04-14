import React, { useState } from 'react';
import { 
  Book, 
  Plus, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  DollarSign, 
  Package, 
  Users, 
  ChevronRight, 
  Search,
  AlertCircle,
  Save,
  X,
  RefreshCw,
  Edit
} from 'lucide-react';
import { SchoolData, Handout, HandoutDelivery, Class, Student } from '../types';
import { dbService } from '../services/dbService';
import { useDialog } from '../DialogContext';
import { supabase, isSupabaseConfigured } from '../services/supabase';

interface HandoutsProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const Handouts: React.FC<HandoutsProps> = ({ data, updateData }) => {
  const { showAlert, showConfirm } = useDialog();
  const [showAddHandout, setShowAddHandout] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [selectedClass, setSelectedClass] = useState<Class | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState<'classes' | 'individual'>('classes');
  const [isSyncing, setIsSyncing] = useState(false);
  const [editingHandoutId, setEditingHandoutId] = useState<string | null>(null);

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowAddHandout(false);
      setSelectedClass(null);
      setSelectedStudent(null);
      setIsClosing(false);
      setEditingHandoutId(null);
      setNewHandout({ name: '', price: 0 });
    }, 400);
  };

  // Sync Asaas payments on mount
  React.useEffect(() => {
    syncAsaasPayments();
  }, []);

  // Auto-sync handout payment status with Finance payments
  React.useEffect(() => {
    if (!data.payments || !data.handoutDeliveries) return;

    const currentDeliveries = data.handoutDeliveries;
    const currentPayments = data.payments;
    const currentHandouts = data.handouts || [];

    const updatedDeliveries = currentDeliveries.map(delivery => {
      if (delivery.paymentStatus === 'pending') {
        const handout = currentHandouts.find(h => h.id === delivery.handoutId);
        const isPaidInFinance = currentPayments.some(p => 
          p.studentId === delivery.studentId && 
          p.status === 'paid' && 
          (
            (delivery.asaasPaymentId && p.asaasPaymentId === delivery.asaasPaymentId) ||
            (handout && p.description && p.description.includes(handout.name))
          )
        );

        if (isPaidInFinance) {
          return {
            ...delivery,
            paymentStatus: 'paid' as const,
            paymentDate: delivery.paymentDate || new Date().toISOString()
          };
        }
      }
      return delivery;
    });

    const hasChanges = updatedDeliveries.some((d, i) => d.paymentStatus !== currentDeliveries[i].paymentStatus);

    if (hasChanges) {
      updateData({ handoutDeliveries: updatedDeliveries });
      dbService.saveData({ ...data, handoutDeliveries: updatedDeliveries });
    }
  }, [data.payments, data.handoutDeliveries, data.handouts, updateData, data]);

  // Sincronização automática removida conforme pedido
  const syncAsaasPayments = () => {
    // Função desativada para manter compatibilidade com render e evitar erros de referência
  };
  
  // Form state for new handout
  const [newHandout, setNewHandout] = useState<Partial<Handout>>({
    name: '',
    price: 0,
    description: '',
    finePercentage: 0,
    interestPercentage: 0
  });

  const handouts = data.handouts || [];
  const deliveries = data.handoutDeliveries || [];
  const classes = data.classes || [];
  const students = data.students || [];

  const handleAddHandout = () => {
    if (!newHandout.name || newHandout.price === undefined) {
      showAlert('Erro', 'Por favor, preencha o nome e o preço da apostila.', 'error');
      return;
    }

    let updatedHandouts: Handout[];

    if (editingHandoutId) {
      updatedHandouts = handouts.map(h => 
        h.id === editingHandoutId 
          ? { 
              ...h, 
              name: newHandout.name!, 
              price: newHandout.price!, 
              description: newHandout.description,
              finePercentage: newHandout.finePercentage || 0,
              interestPercentage: newHandout.interestPercentage || 0
            }
          : h
      );
      showAlert('Sucesso', 'Apostila atualizada com sucesso!', 'success');
    } else {
      const handout: Handout = {
        id: crypto.randomUUID(),
        name: newHandout.name,
        price: newHandout.price,
        description: newHandout.description,
        finePercentage: newHandout.finePercentage || 0,
        interestPercentage: newHandout.interestPercentage || 0
      };
      updatedHandouts = [...handouts, handout];
      showAlert('Sucesso', 'Apostila adicionada com sucesso!', 'success');
    }

    updateData({ handouts: updatedHandouts });
    dbService.saveData({ ...data, handouts: updatedHandouts });
    
    setNewHandout({ name: '', price: 0, description: '', finePercentage: 0, interestPercentage: 0 });
    setShowAddHandout(false);
    setEditingHandoutId(null);
  };

  const handleEditHandout = (handout: Handout) => {
    setNewHandout({
      name: handout.name,
      price: handout.price,
      description: handout.description || '',
      finePercentage: handout.finePercentage || 0,
      interestPercentage: handout.interestPercentage || 0
    });
    setEditingHandoutId(handout.id);
    setShowAddHandout(true);
  };

  const handleDeleteHandout = (id: string) => {
    showConfirm(
      'Excluir Apostila',
      'Tem certeza que deseja excluir esta apostila? Isso removerá todos os registros de entrega vinculados.',
      () => {
        const updatedHandouts = handouts.filter(h => h.id !== id);
        const updatedDeliveries = deliveries.filter(d => d.handoutId !== id);
        updateData({ handouts: updatedHandouts, handoutDeliveries: updatedDeliveries });
        dbService.saveData({ ...data, handouts: updatedHandouts, handoutDeliveries: updatedDeliveries });
      }
    );
  };

  const toggleDeliveryStatus = (studentId: string, handoutId: string) => {
    const existing = deliveries.find(d => d.studentId === studentId && d.handoutId === handoutId);
    let updatedDeliveries: HandoutDelivery[];

    if (existing) {
      updatedDeliveries = deliveries.map(d => 
        (d.studentId === studentId && d.handoutId === handoutId)
          ? { 
              ...d, 
              deliveryStatus: d.deliveryStatus === 'delivered' ? 'pending' : 'delivered',
              deliveryDate: d.deliveryStatus === 'delivered' ? undefined : new Date().toISOString()
            }
          : d
      );
    } else {
      updatedDeliveries = [
        ...deliveries,
        {
          id: crypto.randomUUID(),
          studentId,
          handoutId,
          deliveryStatus: 'delivered',
          paymentStatus: 'pending',
          deliveryDate: new Date().toISOString()
        }
      ];
    }

    updateData({ handoutDeliveries: updatedDeliveries });
    dbService.saveData({ ...data, handoutDeliveries: updatedDeliveries });
  };

  const togglePaymentStatus = (studentId: string, handoutId: string) => {
    const existing = deliveries.find(d => d.studentId === studentId && d.handoutId === handoutId);
    let updatedDeliveries: HandoutDelivery[];

    if (existing) {
      updatedDeliveries = deliveries.map(d => 
        (d.studentId === studentId && d.handoutId === handoutId)
          ? { 
              ...d, 
              paymentStatus: d.paymentStatus === 'paid' ? 'pending' : 'paid',
              paymentDate: d.paymentStatus === 'paid' ? undefined : new Date().toISOString()
            }
          : d
      );
    } else {
      updatedDeliveries = [
        ...deliveries,
        {
          id: crypto.randomUUID(),
          studentId,
          handoutId,
          deliveryStatus: 'pending',
          paymentStatus: 'paid',
          paymentDate: new Date().toISOString()
        }
      ];
    }

    updateData({ handoutDeliveries: updatedDeliveries });
    dbService.saveData({ ...data, handoutDeliveries: updatedDeliveries });
  };

  const getStudentDelivery = (studentId: string, handoutId: string) => {
    return deliveries.find(d => d.studentId === studentId && d.handoutId === handoutId);
  };

  const filteredClasses = classes.filter(c => 
    (c.name || '').toLowerCase().includes((searchTerm || '').toLowerCase())
  );

  const filteredStudents = students.filter(s => 
    (s.name || '').toLowerCase().includes((searchTerm || '').toLowerCase()) ||
    (s.cpf || '').includes(searchTerm || '')
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Gestão de Apostilas</h2>
          <p className="text-slate-500 font-medium">Cadastre livros e gerencie entregas e pagamentos.</p>
        </div>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-2">
            <button 
              onClick={() => setShowAddHandout(true)}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100"
            >
              <Plus size={20} /> Adicionar Apostila
            </button>
          </div>
        </div>
      </header>

      {/* Handouts List */}
      <section className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div className="flex items-center gap-3 text-indigo-600">
          <div className="p-2 bg-indigo-50 rounded-lg">
            <Book size={20} />
          </div>
          <h3 className="text-lg font-black text-slate-800">Apostilas Cadastradas</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {handouts.map(handout => (
            <div key={handout.id} className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex justify-between items-start group">
              <div>
                <h4 className="font-bold text-slate-800">{handout.name}</h4>
                <p className="text-xs text-slate-500">{handout.description || 'Sem descrição'}</p>
                <p className="text-sm font-black text-indigo-600 mt-2">R$ {handout.price.toFixed(2)}</p>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                <button 
                  onClick={() => handleEditHandout(handout)}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                  title="Editar"
                >
                  <Edit size={16} />
                </button>
                <button 
                  onClick={() => handleDeleteHandout(handout.id)}
                  className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                  title="Excluir"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
          {handouts.length === 0 && (
            <div className="col-span-full py-8 text-center text-slate-400 italic text-sm">Nenhuma apostila cadastrada.</div>
          )}
        </div>
      </section>

      {/* Management Tabs */}
      <section className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
            <button 
              onClick={() => { setActiveTab('classes'); setSearchTerm(''); }}
              className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'classes' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              POR TURMA
            </button>
            <button 
              onClick={() => { setActiveTab('individual'); setSearchTerm(''); }}
              className={`px-6 py-2 rounded-lg text-xs font-black transition-all ${activeTab === 'individual' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              POR ALUNO
            </button>
          </div>
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input 
              type="text" 
              placeholder={activeTab === 'classes' ? "Buscar turma..." : "Buscar aluno..."}
              className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {activeTab === 'classes' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredClasses.map(cls => (
              <button 
                key={cls.id}
                onClick={() => setSelectedClass(cls)}
                className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left group"
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                    <Users size={24} />
                  </div>
                  <ChevronRight size={20} className="text-slate-300 group-hover:text-indigo-400 transition-colors" />
                </div>
                <h4 className="text-lg font-black text-slate-800 mb-1">{cls.name}</h4>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  {students.filter(s => s.classId === cls.id).length} Alunos
                </p>
              </button>
            ))}
            {filteredClasses.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 italic">Nenhuma turma encontrada.</div>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredStudents.map(student => (
              <button 
                key={student.id}
                onClick={() => setSelectedStudent(student)}
                className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200 transition-all text-left flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-black">
                  {student.name.charAt(0)}
                </div>
                <div>
                  <h4 className="font-bold text-slate-800 text-sm">{student.name}</h4>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {classes.find(c => c.id === student.classId)?.name || 'Sem Turma'}
                  </p>
                </div>
              </button>
            ))}
            {filteredStudents.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-400 italic">Nenhum aluno encontrado.</div>
            )}
          </div>
        )}
      </section>

      {/* Add Handout Modal */}
      {showAddHandout && (
        <div className={`fixed inset-0 bg-transparent z-[100] flex items-center justify-center p-4 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white w-full max-w-md rounded-2xl shadow-2xl my-auto transition-all duration-400 ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">{editingHandoutId ? 'Editar Apostila' : 'Nova Apostila'}</h3>
                <p className="text-sm text-slate-500 font-medium">Cadastre e configure os dados do material.</p>
              </div>
              <button 
                onClick={closeModal} 
                className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-xl shadow-sm transition-all hover:rotate-90"
              >
                <X size={24} />
              </button>
            </div>
            <div className="p-8 space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Nome da Apostila / Livro</label>
                <input 
                  type="text" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  placeholder="Ex: Apostila de Inglês Vol 1"
                  value={newHandout.name}
                  onChange={(e) => setNewHandout({...newHandout, name: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Preço (R$)</label>
                <input 
                  type="number" 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                  placeholder="0.00"
                  value={newHandout.price}
                  onChange={(e) => setNewHandout({...newHandout, price: parseFloat(e.target.value)})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Multa (%)</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    placeholder="0"
                    value={newHandout.finePercentage}
                    onChange={(e) => setNewHandout({...newHandout, finePercentage: parseFloat(e.target.value)})}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Juros ao Mês (%)</label>
                  <input 
                    type="number" 
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm"
                    placeholder="0"
                    value={newHandout.interestPercentage}
                    onChange={(e) => setNewHandout({...newHandout, interestPercentage: parseFloat(e.target.value)})}
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Descrição (Opcional)</label>
                <textarea 
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm h-24 resize-none"
                  placeholder="Detalhes sobre o material..."
                  value={newHandout.description}
                  onChange={(e) => setNewHandout({...newHandout, description: e.target.value})}
                />
              </div>
              <button 
                onClick={handleAddHandout}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold text-sm hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2"
              >
                <Save size={20} /> Salvar Apostila
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Individual Student Management Modal */}
      {selectedStudent && (
        <div className={`fixed inset-0 bg-transparent z-[100] flex items-center justify-center p-4 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col my-auto transition-all duration-400 ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white shadow-md flex items-center justify-center text-indigo-600 font-black text-2xl border border-indigo-50">
                  {selectedStudent.name.charAt(0)}
                </div>
                <div>
                  <h3 className="text-2xl font-black text-slate-800 tracking-tight">{selectedStudent.name}</h3>
                  <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">
                    {classes.find(c => c.id === selectedStudent.classId)?.name || 'Sem Turma'}
                  </p>
                </div>
              </div>
              <button onClick={closeModal} className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-xl shadow-sm transition-all hover:rotate-90">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
              {handouts.length === 0 ? (
                <div className="text-center py-12 text-slate-400 italic">Nenhuma apostila cadastrada.</div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {handouts.map(handout => {
                    const delivery = getStudentDelivery(selectedStudent.id, handout.id);
                    return (
                      <div key={handout.id} className="bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <h5 className="font-bold text-slate-800">{handout.name}</h5>
                          <p className="text-xs font-black text-indigo-600">R$ {handout.price.toFixed(2)}</p>
                        </div>

                          <div className="flex gap-2">
                            <button 
                              onClick={() => toggleDeliveryStatus(selectedStudent.id, handout.id)}
                            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                              delivery?.deliveryStatus === 'delivered' 
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                                : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <Package size={14} />
                            {delivery?.deliveryStatus === 'delivered' ? 'Entregue' : 'Entrega'}
                          </button>
                          <button 
                            onClick={() => togglePaymentStatus(selectedStudent.id, handout.id)}
                            className={`flex-1 md:flex-none px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
                              delivery?.paymentStatus === 'paid' 
                                ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                                : 'bg-white text-slate-400 border border-slate-200 hover:bg-slate-50'
                            }`}
                          >
                            <DollarSign size={14} />
                            {delivery?.paymentStatus === 'paid' ? 'Pago' : 'Pagamento'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Class Management Modal */}
      {selectedClass && (
        <div className={`fixed inset-0 bg-transparent z-[100] flex items-center justify-center p-4 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white w-full max-w-5xl h-[85vh] rounded-2xl shadow-2xl flex flex-col my-auto transition-all duration-400 ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">{selectedClass.name}</h3>
                <p className="text-sm text-slate-500 font-bold uppercase tracking-widest">Controle de Entregas por Turma</p>
              </div>
              <button onClick={closeModal} className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-xl shadow-sm transition-all hover:rotate-90">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              {handouts.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 space-y-4">
                  <AlertCircle size={48} className="opacity-20" />
                  <p className="font-medium">Nenhuma apostila cadastrada para gerenciar.</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {students.filter(s => s.classId === selectedClass.id).map(student => (
                    <div key={student.id} className="bg-slate-50 rounded-2xl p-6 border border-slate-100 space-y-4">
                      <div className="flex items-center gap-3 border-b border-slate-200 pb-4">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 font-black">
                          {student.name.charAt(0)}
                        </div>
                        <h4 className="font-black text-slate-800">{student.name}</h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {handouts.map(handout => {
                          const delivery = getStudentDelivery(student.id, handout.id);
                          return (
                            <div key={handout.id} className="bg-white p-4 rounded-xl border border-slate-200 space-y-4 shadow-sm">
                              <div className="flex justify-between items-start">
                                <h5 className="font-bold text-slate-700 text-sm">{handout.name}</h5>
                                <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded">R$ {handout.price.toFixed(2)}</span>
                              </div>

                              <div className="flex gap-2">
                                <button 
                                  onClick={() => toggleDeliveryStatus(student.id, handout.id)}
                                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                    delivery?.deliveryStatus === 'delivered' 
                                      ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' 
                                      : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200'
                                  }`}
                                >
                                  <Package size={14} />
                                  {delivery?.deliveryStatus === 'delivered' ? 'Entregue' : 'Entrega'}
                                </button>
                                <button 
                                  onClick={() => togglePaymentStatus(student.id, handout.id)}
                                  className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                                    delivery?.paymentStatus === 'paid' 
                                      ? 'bg-amber-100 text-amber-700 border border-amber-200' 
                                      : 'bg-slate-100 text-slate-400 border border-slate-200 hover:bg-slate-200'
                                  }`}
                                >
                                  <DollarSign size={14} />
                                  {delivery?.paymentStatus === 'paid' ? 'Pago' : 'Pagamento'}
                                </button>
                              </div>

                              {(delivery?.deliveryDate || delivery?.paymentDate) && (
                                <div className="pt-2 border-t border-slate-100 space-y-1">
                                  {delivery.deliveryDate && (
                                    <p className="text-[9px] text-slate-400 flex items-center gap-1">
                                      <CheckCircle size={10} className="text-emerald-500" /> 
                                      Entrega: {new Date(delivery.deliveryDate).toLocaleDateString()}
                                    </p>
                                  )}
                                  {delivery.paymentDate && (
                                    <p className="text-[9px] text-slate-400 flex items-center gap-1">
                                      <CheckCircle size={10} className="text-amber-500" /> 
                                      Pagamento: {new Date(delivery.paymentDate).toLocaleDateString()}
                                    </p>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  {students.filter(s => s.classId === selectedClass.id).length === 0 && (
                    <div className="text-center py-12 text-slate-400 italic">Nenhum aluno nesta turma.</div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Handouts;
