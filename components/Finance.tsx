import React, { useState, useMemo } from 'react';
import { SchoolData, Payment, Student } from '../types';
import { useDialog } from '../DialogContext';
import SearchableSelect from './SearchableSelect';
import { CheckCircle, Clock, AlertCircle, RefreshCw, Filter, DollarSign, Plus, X, Download, FileSignature, Printer, Tag, Hash, User, BookOpen, Trash2, Pencil, Eye, Calendar, AlertTriangle, Barcode, Receipt, Layers, ChevronUp, ChevronDown, Database, Search } from 'lucide-react';
import { pdfService } from '../services/pdfService';
import { supabase, isSupabaseConfigured } from '../services/supabase';

interface FinanceProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const Finance: React.FC<FinanceProps> = ({ data, updateData }) => {
  const { showAlert } = useDialog();
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'paid' | 'overdue'>('all');
  const [filterType, setFilterType] = useState<'all' | 'avulsas' | 'parcelamentos'>('all');
  const [expandedInstallments, setExpandedInstallments] = useState<string[]>([]);
  const [filterStudent, setFilterStudent] = useState<string>('all');
  const [filterClass, setFilterClass] = useState<string>('all');

  // Modais states

  // Instanciado dinamicamente para manter o form state
  const [showInstallmentSelectModal, setShowInstallmentSelectModal] = useState(false);
  const [availableInstallments, setAvailableInstallments] = useState<any[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showPrintCarneModal, setShowPrintCarneModal] = useState(false);
  const [showSupabaseModal, setShowSupabaseModal] = useState(false);
  const [supabaseRecords, setSupabaseRecords] = useState<any[]>([]);
  const [isFetchingSupabase, setIsFetchingSupabase] = useState(false);
  const [supabaseSearch, setSupabaseSearch] = useState('');
  const [selectedSupabaseRows, setSelectedSupabaseRows] = useState<string[]>([]);

  // Selection states
  const [selectedStudentHistory, setSelectedStudentHistory] = useState<Student | null>(null);
  const [selectedStudentForCarne, setSelectedStudentForCarne] = useState<string>('');
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [carneToDelete, setCarneToDelete] = useState<{ installmentId: string, payments: any[] } | null>(null);
  const [carneSelectedPayments, setCarneSelectedPayments] = useState<string[]>([]);
  const [paymentToEdit, setPaymentToEdit] = useState<Payment | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [isFetchingCarne, setIsFetchingCarne] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  React.useEffect(() => {
    syncAsaasPayments();
  }, []);

  const [showFallbackModal, setShowFallbackModal] = useState(false);
  const [fallbackInstallments, setFallbackInstallments] = useState<any[]>([]);

  const handleOpenPaymentLink = async (id: string, type: 'boleto' | 'recibo' | 'carne') => {
    try {
      showAlert('Aguarde', `Buscando ${type}...`, 'info');

      if (type === 'carne') {
        const response = await fetch(`/api/parcelamentos/${id}/carne`);
        const result = await response.json();

        if (response.ok) {
          if (result.type === 'fallback') {
            setFallbackInstallments(result.boletos);
            setShowFallbackModal(true);
            showAlert('Atenção', result.message, 'info');
          } else if (result.type === 'pdf' && result.url) {
            window.open(result.url, '_blank', 'noopener,noreferrer');
            showAlert('Sucesso', 'Carnê localizado com sucesso!', 'success');
          }
        } else {
          showAlert('Erro', result.error || 'Falha ao buscar carnê.', 'error');
        }
        return;
      }

      const response = await fetch(`/api/cobrancas/${id}/link`);
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

  const checkInstallmentsForStudent = (studentId: string) => {
    const studentPayments = data.payments.filter(p => p.studentId === studentId && (p.asaasInstallmentId || p.installmentId || p.installment));
    const grouped = {} as Record<string, any>;
    studentPayments.forEach(p => {
      const iid = p.asaasInstallmentId || p.installmentId || (typeof p.installment === 'object' ? p.installment.id : p.installment);
      if (!iid) return;
      if (!grouped[iid]) grouped[iid] = { id: iid, description: p.description || 'Parcelamento', total: 0, count: 0 };
      grouped[iid].total += p.amount;
      grouped[iid].count++;
    });
    const uniqueInstallments = Object.values(grouped);

    if (uniqueInstallments.length === 0) {
      showAlert('Atenção', 'Este aluno não possui nenhum parcelamento ativo no momento.', 'warning');
      return;
    }

    if (uniqueInstallments.length === 1) {
      executePrintCarne(uniqueInstallments[0].id);
    } else {
      setAvailableInstallments(uniqueInstallments);
      setShowInstallmentSelectModal(true);
    }
  };

  // Função reutilizável para a impressão do carnê
  // Recebe o ID do parcelamento (ex: UUID puro), faz o acesso à rota do back-end que retorna o PDF binário diretamente.
  const executePrintCarne = async (installmentId: string) => {
    try {
      // Garante que é o UUID puro (remove ins_ caso exista)
      const cleanId = installmentId.replace(/^(ins_|inst_)/, '');

      let url = `/api/imprimir-carne/${cleanId}`;

      // Abre a rota (que retorna Content-Type: application/pdf) em uma nova aba
      window.open(url, '_blank', 'noopener,noreferrer');
      showAlert('Sucesso', 'Abrindo o carnê...', 'info');
    } catch (error) {
      console.error(error);
      showAlert('Erro', 'Ocorreu um erro ao tentar abrir o carnê.', 'error');
    } finally {
      setShowInstallmentSelectModal(false);
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
        }
      } else {
        showAlert('Atenção', result.error || 'Não foi possível encontrar o carnê deste aluno.', response.status === 400 ? 'warning' : 'error');
      }
    } catch (error) {
      console.error('Erro ao buscar carnê:', error);
      showAlert('Erro', 'Ocorreu um erro ao processar sua solicitação.', 'error');
    } finally {
      setIsFetchingCarne(false);
    }
  };

  const dataPaymentsRef = React.useRef(data.payments);
  React.useEffect(() => {
    dataPaymentsRef.current = data.payments;
  }, [data.payments]);

  const syncAsaasPayments = async () => {
    if (!isSupabaseConfigured() || isSyncing) return;

    setIsSyncing(true);
    try {
      const { data: cloudPayments, error } = await supabase
        .from('alunos_cobrancas')
        .select('asaas_payment_id, status, aluno_id, valor, vencimento, data_pagamento, installment, asaas_installment_id, link_boleto');

      if (error) throw error;

      if (cloudPayments && cloudPayments.length > 0) {
        let updatedCount = 0;
        const currentPayments = dataPaymentsRef.current;
        const updatedPayments = currentPayments.map(p => {
          const match = cloudPayments.find(cp => {
            if (p.asaasPaymentId) {
              return cp.asaas_payment_id === p.asaasPaymentId;
            }
            return cp.aluno_id === p.studentId &&
              Math.abs(cp.valor - p.amount) < 0.01 &&
              cp.vencimento === p.dueDate;
          });

          if (match) {
            const statusStr = (match.status || '').toLowerCase();
            const newStatus = statusStr === 'pago' ? 'paid' :
              statusStr === 'atrasado' ? 'overdue' :
                statusStr === 'cancelado' ? 'cancelled' : 'pending';

            if (p.status !== newStatus || p.amount !== match.valor || p.installmentId !== (match.asaas_installment_id || match.installment) || p.asaasPaymentUrl !== match.link_boleto || p.asaasPaymentId !== match.asaas_payment_id) {
              updatedCount++;
              return {
                ...p,
                status: newStatus as any,
                amount: match.valor,
                paidDate: match.data_pagamento || p.paidDate,
                installmentId: match.asaas_installment_id || match.installment || p.installmentId,
                asaasPaymentUrl: match.link_boleto || p.asaasPaymentUrl,
                asaasPaymentId: match.asaas_payment_id || p.asaasPaymentId
              };
            }
          }
          return p;
        });

        if (updatedCount > 0) {
          updateData({ payments: updatedPayments });

          // Check if any was updated to overdue
          const hasOverdue = updatedPayments.some((p, idx) => {
            const oldP = currentPayments[idx];
            return oldP && oldP.status !== 'overdue' && p.status === 'overdue';
          });

          const hasPaid = updatedPayments.some((p, idx) => {
            const oldP = currentPayments[idx];
            return oldP && oldP.status !== 'paid' && p.status === 'paid';
          });

          let message = `${updatedCount} pagamento(s) atualizado(s).`;
          if (hasPaid && !hasOverdue) message = 'Pagamento confirmado e registrado.';
          if (hasOverdue && !hasPaid) message = 'Status atualizado para Atrasado.';
          if (hasPaid && hasOverdue) message = 'Pagamentos e atrasos atualizados.';

          showAlert('Sincronização', message, 'success');
        } else {
          showAlert('Sincronização', 'Nenhum novo pagamento confirmado encontrado.', 'info');
        }
      }
    } catch (error) {
      console.error('Erro ao sincronizar pagamentos:', error);
      showAlert('Erro', 'Falha ao sincronizar com o Asaas.', 'error');
    } finally {
      setIsSyncing(false);
    }
  };

  const fetchSupabaseRecords = async () => {
    if (!isSupabaseConfigured()) return;
    setIsFetchingSupabase(true);
    setSelectedSupabaseRows([]); // Clear selection on refresh
    try {
      const { data: records, error } = await supabase
        .from('alunos_cobrancas')
        .select('*')
        .order('vencimento', { ascending: false });

      if (error) throw error;
      setSupabaseRecords(records || []);
    } catch (error) {
      console.error('Error fetching Supabase records:', error);
      showAlert('Erro', 'Falha ao buscar dados do Supabase.', 'error');
    } finally {
      setIsFetchingSupabase(false);
    }
  };

  const deleteSupabaseRecord = async (id: string) => {
    try {
      const { error } = await supabase
        .from('alunos_cobrancas')
        .delete()
        .eq('asaas_payment_id', id);

      if (error) throw error;
      
      setSupabaseRecords(prev => prev.filter(r => r.asaas_payment_id !== id));
      showAlert('Sucesso', 'Registro removido do Supabase.', 'success');
    } catch (error) {
      console.error('Error deleting Supabase record:', error);
      showAlert('Erro', 'Falha ao excluir do Supabase.', 'error');
    }
  };

  const deleteSupabaseRecordsBulk = async () => {
    if (selectedSupabaseRows.length === 0) return;
    
    if(!confirm(`Tem certeza que deseja excluir ${selectedSupabaseRows.length} registros diretamente do Supabase?`)) return;

    setIsFetchingSupabase(true);
    try {
      const { error } = await supabase
        .from('alunos_cobrancas')
        .delete()
        .in('asaas_payment_id', selectedSupabaseRows);

      if (error) throw error;
      
      setSupabaseRecords(prev => prev.filter(r => !selectedSupabaseRows.includes(r.asaas_payment_id)));
      setSelectedSupabaseRows([]);
      showAlert('Sucesso', 'Registros removidos com sucesso.', 'success');
    } catch (error) {
      console.error('Error deleting records in bulk:', error);
      showAlert('Erro', 'Falha ao excluir registros em massa.', 'error');
    } finally {
      setIsFetchingSupabase(false);
    }
  };

  React.useEffect(() => {
    if (showSupabaseModal) {
      fetchSupabaseRecords();
    }
  }, [showSupabaseModal]);

  // General form state
  const [manualInstallments, setManualInstallments] = useState(1);
  const [dueDateDisplay, setDueDateDisplay] = useState(new Date().toLocaleDateString('pt-BR'));
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [selectedItemType, setSelectedItemType] = useState<'course' | 'handout' | ''>('');

  const [formData, setFormData] = useState<Omit<Payment, 'id' | 'status' | 'paidDate' | 'lateFee'> & { fine: number }>({
    studentId: '',
    amount: 150,
    discount: 0,
    discountType: 'fixed',
    fine: 0,
    interest: 0,
    dueDate: new Date().toISOString().split('T')[0],
    type: 'monthly',
    description: ''
  });

  // Auto-fill fine and interest based on student's course or handout
  React.useEffect(() => {
    if (formData.studentId) {
      const student = data.students.find(s => s.id === formData.studentId);
      if (student) {
        let fine = 0;
        let interest = 0;

        if (selectedItemId) {
          if (selectedItemId.startsWith('course_')) {
            const course = data.courses.find(c => c.id === selectedItemId.replace('course_', ''));
            fine = course?.finePercentage || 0;
            interest = course?.interestPercentage || 0;
          } else if (selectedItemId.startsWith('handout_')) {
            const handout = data.handouts?.find(h => h.id === selectedItemId.replace('handout_', ''));
            fine = handout?.finePercentage || 0;
            interest = handout?.interestPercentage || 0;
          }
        } else {
          const studentClass = data.classes.find(c => c.id === student.classId);
          const course = data.courses.find(c => c.id === studentClass?.courseId);
          fine = course?.finePercentage || 0;
          interest = course?.interestPercentage || 0;
        }

        setFormData(prev => ({
          ...prev,
          fine: fine,
          interest: interest
        }));
      }
    }
  }, [formData.studentId, selectedItemId, data.students, data.classes, data.courses, data.handouts]);

  const formatDateMask = (val: string) => {
    return val.replace(/\D/g, '').replace(/(\d{2})(\d)/, '$1/$2').replace(/(\d{2})(\d)/, '$1/$2').slice(0, 10);
  };

  const dateBrToIso = (br: string) => {
    if (br.length !== 10) return '';
    const [d, m, y] = br.split('/');
    return `${y}-${m}-${d}`;
  };

  const paymentIndexMap = useMemo(() => {
    return new Map(data.payments.map((p, i) => [p.id, i]));
  }, [data.payments]);

  const maxIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    data.payments.forEach(p => {
      const key = p.installmentId || p.id;
      const currentIndex = paymentIndexMap.get(p.id) || 0;
      const maxSoFar = map.get(key) || -1;
      if (currentIndex > maxSoFar) map.set(key, currentIndex);
    });
    return map;
  }, [data.payments, paymentIndexMap]);

  const filteredPayments = data.payments
    .filter(p => {
      const statusMatch = filterStatus === 'all' || p.status === filterStatus;
      const studentMatch = filterStudent === 'all' || p.studentId === filterStudent;

      let classMatch = true;
      if (filterClass !== 'all') {
        const student = data.students.find(s => s.id === p.studentId);
        classMatch = student?.classId === filterClass;
      }

      let typeMatch = true;
      if (filterType === 'avulsas') {
        typeMatch = !p.installmentId && !p.asaasInstallmentId;
      } else if (filterType === 'parcelamentos') {
        typeMatch = !!p.installmentId || !!p.asaasInstallmentId;
      }

      return statusMatch && studentMatch && classMatch && typeMatch;
    })
    .sort((a, b) => {
      const keyA = maxIndexMap.get(a.installmentId || a.asaasInstallmentId || a.id) || 0;
      const keyB = maxIndexMap.get(b.installmentId || b.asaasInstallmentId || b.id) || 0;
      if (keyA !== keyB) return keyB - keyA;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    });

  const groupedInstallments = useMemo(() => {
    if (filterType !== 'parcelamentos') return [];

    const groups: Record<string, Payment[]> = {};
    filteredPayments.forEach(p => {
      const groupKey = p.installmentId || p.asaasInstallmentId;
      if (groupKey) {
        if (!groups[groupKey]) groups[groupKey] = [];
        groups[groupKey].push(p);
      }
    });

    return Object.entries(groups).map(([id, payments]) => {
      const sorted = payments.sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      return {
        installmentId: id,
        payments: sorted,
        studentId: sorted[0].studentId,
        totalAmount: sorted.reduce((sum, p) => sum + p.amount, 0),
        totalInstallments: sorted[0].totalInstallments || sorted.length,
        description: sorted[0].description?.split(' (')[0] || 'Parcelamento',
        dueDate: sorted[0].dueDate
      };
    }).sort((a, b) => {
      const keyA = maxIndexMap.get(a.installmentId) || 0;
      const keyB = maxIndexMap.get(b.installmentId) || 0;
      return keyB - keyA;
    });
  }, [filteredPayments, filterType, maxIndexMap]);

  const toggleInstallment = (id: string) => {
    setExpandedInstallments(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleItemSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedItemId(val);

    if (!val) {
      setSelectedItemType('');
      setFormData(prev => ({ ...prev, amount: 0, description: '' }));
      return;
    }


    if (val.startsWith('course_')) {
      const courseId = val.replace('course_', '');
      const course = data.courses.find(c => c.id === courseId);
      if (course) {
        setSelectedItemType('course');
        setFormData(prev => ({
          ...prev,
          amount: course.monthlyFee,
          description: `Mensalidade - ${course.name}`,
          type: 'monthly',
          fine: course.finePercentage || 0,
          interest: course.interestPercentage || 0
        }));
      }
    } else if (val.startsWith('handout_')) {
      const handoutId = val.replace('handout_', '');
      const handout = data.handouts?.find(h => h.id === handoutId);
      if (handout) {
        setSelectedItemType('handout');
        setFormData(prev => ({
          ...prev,
          amount: handout.price,
          description: `Apostila - ${handout.name}`,
          type: 'other',
          fine: handout.finePercentage || 0,
          interest: handout.interestPercentage || 0
        }));
      }
    }
  };

  const handleCreatePayment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.studentId || formData.amount <= 0) {
      showAlert('Atenção', '⚠️ Por favor, selecione um aluno e informe um valor válido.', 'warning');
      return;
    }

    const student = data.students.find(s => s.id === formData.studentId);
    if (!student) {
      showAlert('Erro', 'Aluno não encontrado.', 'error');
      return;
    }

    const newPayments: Payment[] = [];

    let baseDateStr = formData.dueDate;
    if (dueDateDisplay.length === 10) {
      baseDateStr = dateBrToIso(dueDateDisplay);
    }
    const baseDate = new Date(baseDateStr);

    for (let i = 0; i < manualInstallments; i++) {
      const dueDate = new Date(baseDate);
      dueDate.setMonth(baseDate.getMonth() + i);

      // Enviar o valor integral para o Asaas, o desconto será condicional
      const baseAmount = formData.amount;

      const { fine, ...rest } = formData;
      const paymentDueDate = dueDate.toISOString().split('T')[0];

      newPayments.push({
        ...rest,
        lateFee: fine,
        dueDate: paymentDueDate,
        id: crypto.randomUUID(),
        amount: baseAmount,
        status: 'pending',
        installmentNumber: manualInstallments > 1 ? i + 1 : undefined,
        totalInstallments: manualInstallments > 1 ? manualInstallments : undefined,
        description: manualInstallments > 1
          ? `${formData.description || 'Mensalidade'} (${i + 1}/${manualInstallments})`
          : formData.description
      });
    }

    try {
      const isoDueDate = newPayments[0].dueDate;

      // Cálculo preciso de idade — Bloqueio de bugs de fuso horário
      const birthDateStr = student.birthDate || student.data_nascimento || '';
      let age = 18; // Padrão: Maior de idade se não tiver data

      if (birthDateStr && birthDateStr.includes('-')) {
        const [year, month, day] = birthDateStr.split('-').map(Number);
        const birthDate = new Date(year, month - 1, day);
        const today = new Date();
        age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }
      }

      const isMinor = age < 18;

      // Fallback robusto: Se for menor, mas não tiver dados do responsável, envia para o aluno mesmo assim para não quebrar.
      const finalName = (isMinor && student.guardianName && student.guardianName.trim() !== '') ? student.guardianName : student.name;
      const finalPhone = (isMinor && student.guardianPhone && student.guardianPhone.trim() !== '') ? student.guardianPhone : student.phone;

      const rawCpf = (student.cpf || '').replace(/\D/g, '');
      const rawGuardianCpf = (student.guardianCpf || '').replace(/\D/g, '');
      const finalCpf = (isMinor && rawGuardianCpf) ? rawGuardianCpf : rawCpf;

      // EXTREMAMENTE IMPORTANTE: No Asaas Oficial, a data de nascimento deve pertencer ao dono do CPF enviado.
      const finalBirthDate = (isMinor && student.guardianBirthDate) ? student.guardianBirthDate : student.birthDate;

      // Validação de campos obrigatórios para o Asaas Oficial
      if (!finalCpf || finalCpf.length < 11) {
        showAlert('Erro de Cadastro', `O ${isMinor ? 'responsável' : 'aluno'} precisa ter um CPF válido cadastrado para gerar cobrança no Asaas Oficial.`, 'error');
        return;
      }

      if (!student.addressZip || student.addressZip.length < 8) {
        showAlert('Erro de Cadastro', 'O CEP do aluno é obrigatório e deve ser válido para o Asaas Oficial.', 'error');
        return;
      }

      if (!student.addressStreet || !student.addressNumber) {
        showAlert('Erro de Cadastro', 'Endereço e Número são obrigatórios no cadastro do aluno para gerar cobrança.', 'error');
        return;
      }

      const originalDesc = formData.description || 'Mensalidade';
      const finalDescription = isMinor ? `${originalDesc} - Aluno: ${student.name}` : originalDesc;

      const response = await fetch('/api/gerar_cobranca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aluno_id: student.id,
          nome: finalName,
          cpf: finalCpf,
          email: student.email,
          valor: formData.amount,
          vencimento: isoDueDate,
          multa: formData.fine,
          juros: formData.interest,
          desconto: Number(formData.discount) || 0,
          telefone: finalPhone,
          cep: student.addressZip,
          endereco: student.addressStreet,
          numero: student.addressNumber,
          bairro: student.addressNeighborhood,
          nascimento: finalBirthDate,
          descricao: finalDescription,
          parcelas: manualInstallments
        })
      });

      if (response.ok) {
        const asaasData = await response.json();

        if (asaasData.payments && asaasData.payments.length > 0) {
          newPayments.forEach((p, idx) => {
            // Se o Asaas retornou menos parcelas que o esperado, usa a última disponível
            const asaasPayment = asaasData.payments[idx] || asaasData.payments[asaasData.payments.length - 1];
            p.asaasPaymentUrl = asaasPayment.link_boleto;
            p.asaasPaymentId = asaasPayment.asaas_payment_id;
            if (asaasData.installment) {
              p.installmentId = asaasData.installment;
            }
          });
        }
      } else {
        throw new Error('Erro na resposta da API');
      }
    } catch (error) {
      console.error('Erro ao conectar com o Asaas:', error);
      showAlert('Atenção', 'Erro ao conectar com o Asaas. Lançamentos salvos apenas localmente.', 'warning');
    }

    let newDeliveries = [...(data.handoutDeliveries || [])];
    if (selectedItemType === 'handout' && newPayments.length > 0) {
      const handoutId = selectedItemId.replace('handout_', '');
      const firstPayment = newPayments[0];

      const existingDeliveryIndex = newDeliveries.findIndex(d => d.studentId === student.id && d.handoutId === handoutId);

      if (existingDeliveryIndex >= 0) {
        newDeliveries[existingDeliveryIndex] = {
          ...newDeliveries[existingDeliveryIndex],
          asaasPaymentId: firstPayment.asaasPaymentId,
          asaasPaymentUrl: firstPayment.asaasPaymentUrl
        };
      } else {
        newDeliveries.push({
          id: crypto.randomUUID(),
          studentId: student.id,
          handoutId: handoutId,
          deliveryStatus: 'pending',
          paymentStatus: 'pending',
          asaasPaymentId: firstPayment.asaasPaymentId,
          asaasPaymentUrl: firstPayment.asaasPaymentUrl
        });
      }
    }

    updateData({
      payments: [...data.payments, ...newPayments],
      ...(selectedItemType === 'handout' ? { handoutDeliveries: newDeliveries } : {})
    });
    showAlert('Sucesso', 'Nova cobrança gerada com sucesso.', 'success');
    closeModal();
  };

  const closeModal = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsModalOpen(false);
      setShowHistoryModal(false);
      setShowDeleteModal(false);
      setIsClosing(false);

      setManualInstallments(1);
      const today = new Date();
      setDueDateDisplay(today.toLocaleDateString('pt-BR'));
      setFormData({
        studentId: '',
        amount: 150,
        discount: 0,
        discountType: 'fixed',
        fine: 0,
        interest: 0,
        dueDate: today.toISOString().split('T')[0],
        type: 'monthly',
        description: ''
      });
      setSelectedStudentHistory(null);
      setPaymentToDelete(null);
    }, 300);
  };

  const handleDelete = async (deleteType: 'single' | 'all') => {
    if (!paymentToDelete || isDeleting) return;

    console.log('Item a ser excluído:', paymentToDelete);

    // Determine the ID to send
    let asaasIdToDelete = '';
    let isInstallmentPackage = false;

    // 1. Se passamos explicitamente o asaasIdParaExcluir (ex: lixeira do grupo de carnê)
    if ((paymentToDelete as any).asaasIdParaExcluir) {
      asaasIdToDelete = (paymentToDelete as any).asaasIdParaExcluir;
      isInstallmentPackage = true;
    }
    // 2. Se for para excluir TUDO (o pacote agrupado, ou usuário clicou em 'Excluir Carnê Completo' numa parcela)
    else if (deleteType === 'all') {
      asaasIdToDelete = paymentToDelete.installmentId || paymentToDelete.id;
      isInstallmentPackage = true;
    }
    // 3. Se for exclusão de apenas uma parcela individual
    else {
      asaasIdToDelete = paymentToDelete.asaasPaymentId || paymentToDelete.id;
      isInstallmentPackage = false;
    }
    if (!asaasIdToDelete) {
      console.error('Falha ao extrair ID. Objeto paymentToDelete:', paymentToDelete);
      showAlert('Erro', 'ID da cobrança não encontrado.', 'error');
      return;
    }

    setIsDeleting(true);
    try {
      showAlert('Aguarde', isInstallmentPackage ? 'Excluindo carnê completo no Asaas...' : 'Excluindo cobrança no Asaas...', 'info');
      const response = await fetch('/api/excluir_cobranca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: asaasIdToDelete })
      });

      const result = await response.json();

      if (response.ok) {
        showAlert('Sucesso', 'Cobrança excluída com sucesso.', 'success');

        // SO atualiza se backend confirmou (200 OK)
        let updatedPayments = [...data.payments];
        if (isInstallmentPackage) {
          updatedPayments = updatedPayments.filter(p => p.installmentId !== asaasIdToDelete);
        } else {
          updatedPayments = updatedPayments.filter(p => p.asaasPaymentId !== asaasIdToDelete && p.id !== asaasIdToDelete);
        }
        updateData({ payments: updatedPayments });
        closeModal();
      } else {
        showAlert('Erro', result.error || 'Não é possível excluir. Verifique se já foi paga.', 'error');
      }
    } catch (error) {
      console.error('Erro ao excluir:', error);
      showAlert('Erro', 'Falha na comunicação com o servidor ao excluir.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentToEdit || isEditing) return;
    setIsEditing(true);
    try {
      const targetId = paymentToEdit.asaasPaymentId || paymentToEdit.id;
      const response = await fetch(`/api/cobrancas/${targetId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ valor: parseFloat(editValue.replace(',', '.')), vencimento: editDate })
      });
      const result = await response.json();
      if (response.ok) {
        updateData({
          payments: data.payments.map(p => p.id === paymentToEdit.id ? { ...p, amount: parseFloat(editValue.replace(',', '.')), dueDate: editDate } : p)
        });
        showAlert('Sucesso', 'Cobrança atualizada!', 'success');
        setPaymentToEdit(null);
      } else {
        showAlert('Erro', result.error || 'Falha ao atualizar.', 'error');
      }
    } catch {
      showAlert('Erro', 'Falha na comunicação com o servidor.', 'error');
    } finally {
      setIsEditing(false);
    }
  };


  const handleBulkDelete = async (ids: string[], isCarneContext = false) => {
    if (ids.length === 0 || isDeleting) return;
    setIsDeleting(true);
    let successCount = 0;
    let newPayments = [...data.payments];

    showAlert('Aguarde', `Excluindo ${ids.length} cobranças no Asaas...`, 'info');

    for (const id of ids) {
      try {
        const response = await fetch('/api/excluir_cobranca', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        if (response.ok) {
          successCount++;
          newPayments = newPayments.filter(p => p.id !== id && p.asaasPaymentId !== id);
        }
      } catch (e) { console.error('Error batch deleting', id, e); }
    }

    if (successCount > 0) {
      updateData({ payments: newPayments });
      showAlert('Sucesso', `${successCount} exclusão(ões) concluída(s) com sucesso.`, 'success');
    } else {
      showAlert('Erro', 'Falha ao excluir selecionados.', 'error');
    }

    if (isCarneContext) {
      setCarneToDelete(null);
      setCarneSelectedPayments([]);
    } else {
      setSelectedPayments([]);
    }
    setIsDeleting(false);
  };

  const openHistory = (studentId: string) => {
    const student = data.students.find(s => s.id === studentId);
    if (student) {
      setSelectedStudentHistory(student);
      setShowHistoryModal(true);
    }
  };

  const openDelete = (payment: Payment) => {
    setPaymentToDelete(payment);
    setShowDeleteModal(true);
  };

  const getStatusBadge = (payment: Payment) => {
    const status = (payment.status || '').toLowerCase();

    if (status === 'paid' || status === 'pago' || status === 'received' || status === 'confirmed') {
      const dueDate = new Date(payment.dueDate);
      const paidDate = payment.paidDate ? new Date(payment.paidDate) : null;

      if (paidDate) {
        // Reset hours for comparison
        dueDate.setHours(0, 0, 0, 0);
        paidDate.setHours(0, 0, 0, 0);

        if (paidDate <= dueDate) {
          return <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider"><CheckCircle size={12} /> Pagamento em Dia</span>;
        } else {
          return <span className="inline-flex items-center gap-1 text-emerald-900 bg-emerald-100 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider"><CheckCircle size={12} /> Pago com Atraso</span>;
        }
      }
      return <span className="inline-flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider"><CheckCircle size={12} /> Pago</span>;
    }

    if (status === 'overdue' || status === 'atrasado') {
      return <span className="inline-flex items-center gap-1 text-red-600 bg-red-50 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider"><AlertCircle size={12} /> Atrasado</span>;
    }

    if (status === 'pending' || status === 'pendente' || !status) {
      return <span className="inline-flex items-center gap-1 text-amber-600 bg-amber-50 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider"><Clock size={12} /> Pendente</span>;
    }

    if (status === 'cancelled' || status === 'cancelado') {
      return <span className="inline-flex items-center gap-1 text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider"><X size={12} /> Cancelado</span>;
    }

    return null;
  };

  const inputClass = "px-4 py-2 bg-white text-black border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all shadow-sm text-xs";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Financeiro</h2>
          <p className="text-slate-500 text-sm">Gestão de mensalidades vinculadas a contratos e cursos.</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">

          <div className="relative">
            <button
              onClick={() => setShowPrintCarneModal(true)}
              className="flex-1 sm:flex-none bg-white text-indigo-600 border border-indigo-200 px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all shadow-sm font-bold active:scale-95"
            >
              <Printer size={20} /> Imprimir Carnê
            </button>
          </div>

          <button
            onClick={() => setShowSupabaseModal(true)}
            className="flex-1 sm:flex-none bg-slate-800 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-slate-900 transition-all shadow-lg font-bold active:scale-95"
          >
            <Database size={20} /> DB Supabase
          </button>

          <button
            onClick={() => setIsModalOpen(true)}
            className="flex-1 sm:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-700 transition-all shadow-lg font-bold active:scale-95"
          >
            <Plus size={20} /> Novo Lançamento
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
        <div className="p-6 border-b border-slate-100 bg-slate-50/30 space-y-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                <Filter size={16} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">Visão:</span>
              </div>

              <div className="flex gap-1.5">
                {(['all', 'avulsas', 'parcelamentos'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setFilterType(type)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${filterType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                  >
                    {type === 'all' ? 'Todas as Cobranças' : type === 'avulsas' ? 'Avulsas' : 'Parcelamentos (Carnês)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200">
                <Filter size={16} className="text-slate-400" />
                <span className="text-[10px] font-bold text-slate-500 uppercase">Status:</span>
              </div>

              <div className="flex gap-1.5">
                {(['all', 'pending', 'paid', 'overdue'] as const).map(status => (
                  <button
                    key={status}
                    onClick={() => setFilterStatus(status)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${filterStatus === status ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
                      }`}
                  >
                    {status === 'all' ? 'Todos' : status === 'paid' ? 'Pagos' : status === 'pending' ? 'Pendentes' : 'Atrasados'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="relative">
              <BookOpen size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                className={`${inputClass} w-full pl-9`}
                value={filterClass}
                onChange={e => {
                  setFilterClass(e.target.value);
                  setFilterStudent('all'); // Reset student filter when class changes
                }}
              >
                <option value="all">Todas as Turmas</option>
                {data.classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div className="relative">
              <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <select
                className={`${inputClass} w-full pl-9`}
                value={filterStudent}
                onChange={e => setFilterStudent(e.target.value)}
              >
                <option value="all">Todos os Alunos</option>
                {data.students
                  .filter(s => filterClass === 'all' || s.classId === filterClass)
                  .map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          
          {selectedPayments.length > 0 && (
            <div className="flex items-center justify-between bg-red-50 border border-red-100 p-3 rounded-lg animate-in slide-in-from-top-2">
              <div className="flex items-center gap-2 text-red-700 text-xs font-bold uppercase tracking-wider">
                <AlertCircle size={14} />
                {selectedPayments.length} lançamento(s) selecionado(s)
              </div>
              <button 
                onClick={() => {
                  if (confirm(`Deseja excluir permanentemente os ${selectedPayments.length} lançamentos selecionados no Asaas e no sistema?`)) {
                    handleBulkDelete(selectedPayments);
                  }
                }}
                disabled={isDeleting}
                className="bg-red-600 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all flex items-center gap-2 shadow-lg active:scale-95 disabled:opacity-50"
              >
                {isDeleting ? <RefreshCw size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Excluir Selecionados
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left table-auto">
            <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-[0.1em]">
              <tr>
                <th className="w-12 px-4 py-4 text-center">
                  {filterType !== 'parcelamentos' && (
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      checked={selectedPayments.length > 0 && selectedPayments.length === filteredPayments.filter(p => p.status !== 'paid').length}
                      onChange={e => setSelectedPayments(e.target.checked ? filteredPayments.filter(p => p.status !== 'paid').map(p => p.asaasPaymentId || p.id) : [])}
                    />
                  )}
                </th>
                <th className="px-4 py-4">Aluno / Descrição</th>
                <th className="px-4 py-4">Vencimento</th>
                <th className="px-4 py-4">Valor</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filterType === 'parcelamentos' ? (
                groupedInstallments.map(group => {
                  const student = data.students.find(s => s.id === group.studentId);
                  const isExpanded = expandedInstallments.includes(group.installmentId);

                  return (
                    <React.Fragment key={group.installmentId}>
                      <tr className="hover:bg-indigo-50/30 transition-colors group bg-slate-50/50">
                        <td className="px-6 py-5 whitespace-nowrap min-w-[250px]"><div className="font-bold text-slate-900 flex items-center gap-2 truncate max-w-[250px]">{student?.name || 'Aluno Removido'}
                        </div>
                          <div className="text-[10px] font-black text-indigo-500 uppercase tracking-wide mt-1 flex items-center gap-1">
                            <Layers size={12} />
                            Carnê de {group.payments.length}x
                          </div>
                          <div className="text-[10px] text-slate-400 mt-0.5">{group.description}</div>
                        </td>
                        <td className="px-6 py-5 text-slate-600 text-sm font-medium">
                          {group.payments.length > 0 && (
                            <>
                              <span className="text-xs text-slate-400 block">Início: {new Date(group.payments[0].dueDate).toLocaleDateString('pt-BR')}</span>
                              <span className="text-xs text-slate-400 block">Fim: {new Date(group.payments[group.payments.length - 1].dueDate).toLocaleDateString('pt-BR')}</span>
                            </>
                          )}
                        </td>
                        <td className="px-6 py-5">
                          <div className="font-black text-slate-900">R$ {group.totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                          <div className="text-[10px] text-slate-500 font-medium">Total do Carnê</div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="inline-flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider">
                            <Layers size={12} /> {group.payments.length} Parcelas
                          </span>
                        </td>
                        <td className="px-6 py-5 text-right whitespace-nowrap">
                          <div className="flex justify-end items-center gap-2">
                            <button
                              onClick={() => toggleInstallment(group.installmentId)}
                              className="px-3 py-1.5 bg-white text-slate-700 border border-slate-200 rounded-lg text-xs font-bold hover:bg-slate-50 transition-colors inline-flex items-center gap-1.5"
                            >
                              {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                              {isExpanded ? 'Ocultar' : 'Ver Parcelas'}
                            </button>
                            <button
                              onClick={() => executePrintCarne(group.installmentId)}
                              className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors inline-flex items-center gap-1.5 border border-indigo-100"
                            >
                              <Printer size={14} /> Imprimir Carnê
                            </button>
                            <button onClick={() => { setCarneToDelete(group); setCarneSelectedPayments(group.payments.filter(p => p.status !== 'paid').map(p => p.asaasPaymentId || p.id)); }} className="p-2 text-slate-400 hover:text-red-600 transition-all" title="Excluir Carnê Completo (Asaas)"><Trash2 size={18} /></button>
                          </div>
                        </td>
                      </tr>
                      {isExpanded && group.payments.map(payment => {
                        const payId = payment.asaasPaymentId || payment.id;
                        return (
                          <tr key={payment.id} className="hover:bg-indigo-50/10 transition-colors bg-white border-t border-slate-50">
                            <td className="w-12 px-4 py-4 text-center">
                              <input
                                type="checkbox"
                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                                disabled={payment.status === 'paid'}
                                checked={selectedPayments.includes(payId)}
                                onChange={e => setSelectedPayments(prev =>
                                  e.target.checked ? [...prev, payId] : prev.filter(x => x !== payId)
                                )}
                              />
                            </td>
                            <td className="px-4 py-4 pl-8">
                              <div className="text-[10px] font-black text-slate-500 uppercase tracking-wide">
                                Parcela {payment.installmentNumber}/{payment.totalInstallments}
                              </div>
                            </td>
                            <td className="px-4 py-4 text-slate-600 text-sm">
                              {new Date(payment.dueDate + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                            </td>
                            <td className="px-4 py-4">
                              <div className="font-bold text-slate-700 text-sm">R$ {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                              {!!payment.discount && payment.discount > 0 && (
                                <div className="text-[10px] text-emerald-600 font-bold">- R$ {payment.discount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                              )}
                            </td>
                            <td className="px-4 py-4">{getStatusBadge(payment)}</td>
                            <td className="px-4 py-4">
                              <div className="flex justify-end items-center gap-2 whitespace-nowrap">
                                {payment.asaasPaymentId && (
                                  <>
                                    {(payment.status === 'pending' || payment.status === 'overdue') && (
                                      <button onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'boleto')} className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-[10px] font-bold hover:bg-slate-200 inline-flex items-center gap-1">
                                        <Barcode size={11} /> Boleto
                                      </button>
                                    )}
                                    {(payment.status === 'paid' || payment.status === 'received' || payment.status === 'confirmed') && (
                                      <button onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'recibo')} className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[10px] font-bold hover:bg-emerald-100 inline-flex items-center gap-1">
                                        <Receipt size={11} /> Recibo
                                      </button>
                                    )}
                                  </>
                                )}
                                {(payment.installmentId || payment.asaasInstallmentId) && (
                                  <button
                                    onClick={() => executePrintCarne(payment.installmentId || payment.asaasInstallmentId)}
                                    className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-[10px] font-bold hover:bg-indigo-100 inline-flex items-center gap-1"
                                    title="Imprimir Carnê Completo"
                                  >
                                    <Printer size={11} /> Carnê
                                  </button>
                                )}
                                <button onClick={() => { setPaymentToEdit(payment); setEditValue(payment.amount.toString()); setEditDate(payment.dueDate); }} className="p-1 text-slate-400 hover:text-indigo-600" title="Editar">
                                  <Pencil size={13} />
                                </button>
                                <button onClick={() => openDelete(payment)} className="p-1 text-slate-400 hover:text-red-600" title="Excluir">

                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              ) : (
                filteredPayments.map(payment => {
                  const student = data.students.find(s => s.id === payment.studentId);
                  const payId = payment.asaasPaymentId || payment.id;
                  return (
                    <tr key={payment.id} className="hover:bg-indigo-50/30 transition-colors group bg-white">
                      <td className="w-12 px-4 py-5 text-center">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer disabled:opacity-40"
                          disabled={payment.status === 'paid'}
                          checked={selectedPayments.includes(payId)}
                          onChange={e => setSelectedPayments(prev =>
                            e.target.checked ? [...prev, payId] : prev.filter(x => x !== payId)
                          )}
                        />
                      </td>
                      <td className="px-4 py-5">
                        <div className="font-bold text-slate-900 flex items-center gap-1 overflow-hidden" style={{ maxWidth: '240px' }}>
                          <span className="truncate">{student?.name || 'Aluno Removido'}</span>
                          <button onClick={() => student && openHistory(student.id)} className="text-slate-400 hover:text-indigo-600 transition-colors shrink-0" title="Ver Histórico"><Eye size={13} /></button>
                        </div>
                        <div className="text-[10px] font-black text-indigo-500 uppercase tracking-wide mt-0.5">
                          {payment.type === 'registration' ? 'Matrícula' : 'Mensalidade'}{payment.installmentNumber && <span> {payment.installmentNumber}/{payment.totalInstallments}</span>}
                        </div>
                        {payment.description && <div className="text-[10px] text-slate-400 mt-0.5 truncate" style={{ maxWidth: '230px' }}>{payment.description}</div>}
                      </td>
                      <td className="px-4 py-5 text-slate-600 text-sm">{new Date(payment.dueDate + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                      <td className="px-4 py-5">
                        <div className="font-black text-slate-900 text-sm">R$ {payment.amount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
                        {!!payment.discount && payment.discount > 0 && <div className="text-[10px] text-emerald-600 font-bold">- R$ {payment.discount.toFixed(2)}</div>}
                      </td>
                      <td className="px-4 py-5">{getStatusBadge(payment)}</td>
                      <td className="px-4 py-5">
                        <div className="flex justify-end items-center gap-2 whitespace-nowrap">
                          {payment.asaasPaymentId && (<>
                            {(payment.status === 'pending' || payment.status === 'overdue') && (<button onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'boleto')} className="px-2.5 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-200 transition-colors inline-flex items-center gap-1"><Barcode size={13} /> Boleto</button>)}
                            {(payment.status === 'paid' || payment.status === 'received' || payment.status === 'confirmed') && (<button onClick={() => handleOpenPaymentLink(payment.asaasPaymentId!, 'recibo')} className="px-2.5 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-xs font-bold hover:bg-emerald-100 transition-colors inline-flex items-center gap-1 border border-emerald-100"><Receipt size={13} /> Recibo</button>)}
                          </>)}
                          {(payment.installmentId || payment.asaasInstallmentId) && (
                            <button
                              onClick={() => executePrintCarne(payment.installmentId || payment.asaasInstallmentId)}
                              className="px-2.5 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors inline-flex items-center gap-1 border border-indigo-100"
                              title="Imprimir Carnê Completo"
                            >
                              <Printer size={13} /> Carnê
                            </button>
                          )}
                          <button onClick={() => { setPaymentToEdit(payment); setEditValue(payment.amount.toString()); setEditDate(payment.dueDate); }} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-all" title="Editar"><Pencil size={14} /></button>
                          <button onClick={() => openDelete(payment)} className="p-1.5 text-slate-400 hover:text-red-600 transition-all" title="Excluir"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
              {((filterType === 'parcelamentos' && groupedInstallments.length === 0) || (filterType !== 'parcelamentos' && filteredPayments.length === 0)) && (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center text-slate-400 italic">
                    Nenhum lançamento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* NEW PAYMENT MODAL */}
      {isModalOpen && (
        <div className={`fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-xl w-full max-w-lg shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>

            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Novo Lançamento</h3>
                <p className="text-xs text-slate-500">Registre cobranças manuais ou parceladas.</p>
              </div>
              <button onClick={closeModal} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90"><X size={20} /></button>
            </div>
            <form onSubmit={handleCreatePayment} className="p-6 space-y-4">
              <SearchableSelect
                label="Aluno Beneficiário"
                placeholder="Selecione o aluno..."
                required
                options={data.students.map(s => ({
                  id: s.id,
                  name: s.name,
                  subtext: data.classes.find(c => c.id === s.classId)?.name || 'Sem Turma'
                }))}
                value={formData.studentId}
                onChange={val => setFormData({ ...formData, studentId: val })}
              />
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Referente a (Opcional)</label>
                <select className={inputClass + " w-full"} value={selectedItemId} onChange={handleItemSelect}>
                  <option value="">Lançamento Avulso / Personalizado</option>
                  <optgroup label="Cursos">
                    {data.courses?.map(c => <option key={`course_${c.id}`} value={`course_${c.id}`}>{c.name} - R$ {c.monthlyFee.toFixed(2)}</option>)}
                  </optgroup>
                  <optgroup label="Apostilas">
                    {data.handouts?.map(h => <option key={`handout_${h.id}`} value={`handout_${h.id}`}>{h.name} - R$ {h.price.toFixed(2)}</option>)}
                  </optgroup>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Tipo</label>
                  <select className={inputClass + " w-full"} value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })}>
                    <option value="monthly">Mensalidade</option>
                    <option value="registration">Matrícula</option>
                    <option value="other">Outros</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1 flex items-center gap-1"><Hash size={12} /> Qtd. Parcelas</label>
                  <input type="number" min="1" max="100" required className={inputClass + " w-full"} value={manualInstallments} onChange={e => setManualInstallments(parseInt(e.target.value) || 1)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Valor Base (R$)</label>
                  <input type="number" step="0.01" required className={inputClass + " w-full"} value={formData.amount} onChange={e => setFormData({ ...formData, amount: parseFloat(e.target.value) })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1 flex items-center gap-1"><Tag size={12} /> Desconto (R$)</label>
                  <input type="number" step="0.01" className={inputClass + " w-full"} value={formData.discount} onChange={e => setFormData({ ...formData, discount: parseFloat(e.target.value) })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Multa (%)</label>
                  <input type="number" step="0.01" className={inputClass + " w-full"} value={formData.fine} onChange={e => setFormData({ ...formData, fine: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Juros ao Mês (%)</label>
                  <input type="number" step="0.01" className={inputClass + " w-full"} value={formData.interest} onChange={e => setFormData({ ...formData, interest: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Data Vencimento Inicial</label>
                <input
                  required
                  placeholder="DD/MM/AAAA"
                  className={inputClass + " w-full"}
                  value={dueDateDisplay}
                  onChange={e => {
                    const masked = formatDateMask(e.target.value);
                    setDueDateDisplay(masked);
                    if (masked.length === 10) {
                      setFormData(prev => ({ ...prev, dueDate: dateBrToIso(masked) }));
                    }
                  }}
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 ml-1">Descrição</label>
                <input placeholder="Ex: Referente a Janeiro/2024" className={inputClass + " w-full"} value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
              </div>
              <div className="pt-4 flex gap-4">
                <button type="button" onClick={closeModal} className="flex-1 px-4 py-3 border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors font-bold text-xs">Cancelar</button>
                <button type="submit" className="flex-1 px-4 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-all shadow-lg font-bold text-xs">Gerar Lançamento</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STUDENT HISTORY MODAL */}
      {showHistoryModal && selectedStudentHistory && (
        <div className={`fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh] my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>

            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <User size={20} className="text-indigo-600" /> {selectedStudentHistory.name}
                </h3>
                <p className="text-xs text-slate-500">Histórico completo de pagamentos.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => checkInstallmentsForStudent(selectedStudentHistory.id)}
                  disabled={isFetchingCarne}
                  className="px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-all flex items-center gap-2 border border-indigo-100 disabled:opacity-50"
                >
                  {isFetchingCarne ? <RefreshCw size={14} className="animate-spin" /> : <BookOpen size={14} />}
                  Imprimir Carnê Completo
                </button>
                <button onClick={closeModal} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90"><X size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-0">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-bold sticky top-0 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Descrição</th>
                    <th className="px-4 py-3">Vencimento</th>
                    <th className="px-4 py-3">Valor</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {data.payments.filter(p => p.studentId === selectedStudentHistory.id).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map(p => (
                    <tr key={p.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-700">{p.description || (p.type === 'monthly' ? 'Mensalidade' : 'Taxa')}</div>
                        {p.installmentNumber && <div className="text-[9px] text-slate-400">{p.installmentNumber}/{p.totalInstallments}</div>}
                      </td>
                      <td className="px-4 py-3">{new Date(p.dueDate + 'T12:00:00Z').toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                      <td className="px-4 py-3">R$ {p.amount.toFixed(2)}</td>
                      <td className="px-4 py-3">{getStatusBadge(p)}</td>
                      <td className="px-4 py-3 text-right flex justify-end gap-2">
                        {p.asaasPaymentId && (
                          <>
                            {(p.status === 'pending' || p.status === 'overdue') && (
                              <button
                                onClick={() => handleOpenPaymentLink(p.asaasPaymentId!, 'boleto')}
                                className="px-2 py-1 bg-slate-100 text-slate-700 rounded text-[9px] font-bold hover:bg-slate-200 transition-colors inline-flex items-center gap-1"
                              >
                                <Barcode size={12} /> Boleto
                              </button>
                            )}
                            {(p.status === 'paid' || p.status === 'received' || p.status === 'confirmed') && (
                              <button
                                onClick={() => handleOpenPaymentLink(p.asaasPaymentId!, 'recibo')}
                                className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-[9px] font-bold hover:bg-emerald-100 transition-colors inline-flex items-center gap-1 border border-emerald-100"
                              >
                                <Receipt size={12} /> Recibo
                              </button>
                            )}
                          </>
                        )}
                        <button onClick={() => { closeModal(); openDelete(p); }} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 text-right">
              <button onClick={closeModal} className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-slate-600 font-bold text-xs hover:bg-slate-100">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {showDeleteModal && paymentToDelete && (
        <div className={`fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 overflow-y-auto transition-opacity duration-400 ${isClosing ? 'opacity-0' : 'opacity-100 animate-in fade-in'}`}>
          <div className={`bg-white rounded-xl w-full max-w-sm shadow-2xl my-auto transition-all duration-400 relative overflow-hidden ${isClosing ? 'animate-slide-down-fade-out' : 'animate-slide-up'}`}>
            {/* Blue Top Bar */}
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>

            <div className="p-6 text-center">
              <div className="w-12 h-12 bg-red-100 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={24} />
              </div>
              <h3 className="text-lg font-black text-slate-800 mb-2">Excluir Pagamento</h3>
              <p className="text-sm text-slate-500 mb-6">Como deseja excluir este lançamento?</p>

              <div className="flex flex-col gap-2">
                {paymentToDelete.id && typeof paymentToDelete.id === 'string' && (paymentToDelete.id.startsWith('inst_') || paymentToDelete.id.startsWith('ins_')) ? (
                  <button onClick={() => handleDelete('all')} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all">
                    Excluir Carnê Completo
                  </button>
                ) : (
                  <>
                    <button onClick={() => handleDelete('single')} className="w-full py-3 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-all">
                      Excluir Apenas Esta Parcela
                    </button>
                    {(paymentToDelete.installmentId || paymentToDelete.totalInstallments) && (
                      <button onClick={() => handleDelete('all')} className="w-full py-3 bg-white border-2 border-red-100 text-red-600 rounded-xl font-bold text-sm hover:bg-red-50 transition-all">
                        Excluir Carnê Completo (Asaas)
                      </button>
                    )}
                  </>
                )}
                <button onClick={closeModal} className="w-full py-3 text-slate-400 font-bold text-sm hover:text-slate-600 mt-2">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FALLBACK CARNE MODAL */}
      {showFallbackModal && (
        <div className="fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in">
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
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-black uppercase tracking-wider ${parcela.status === 'paid' || parcela.status === 'received' || parcela.status === 'confirmed' ? 'text-emerald-600 bg-emerald-50' :
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

      {/* PRINT CARNE MODAL */}

      {carneToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh] animate-slide-up">
            <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 relative overflow-hidden">
              <div className="relative z-10 flex items-center gap-4">
                <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center shadow-inner">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-800 tracking-tight">Exclusão de Carnê</h3>
                  <p className="text-slate-500 text-sm font-medium mt-1">Selecione as parcelas pendentes para exclusão</p>
                </div>
              </div>
            </div>
            <div className="p-8 overflow-y-auto">
              <div className="space-y-3">
                {carneToDelete.payments.map(p => (
                  <label key={p.id} className={`flex items-center gap-4 p-4 rounded-xl border ${p.status === 'paid' ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 cursor-pointer hover:border-indigo-300'}`}>
                    <input type="checkbox" disabled={p.status === 'paid'} checked={carneSelectedPayments.includes(p.asaasPaymentId || p.id)} onChange={e => {
                      if (e.target.checked) setCarneSelectedPayments(prev => [...prev, p.asaasPaymentId || p.id]);
                      else setCarneSelectedPayments(prev => prev.filter(id => id !== (p.asaasPaymentId || p.id)));
                    }} className="rounded text-indigo-600 w-5 h-5 focus:ring-indigo-500 disabled:opacity-50" />
                    <div className="flex-1 flex justify-between items-center">
                      <div>
                        <span className="font-bold text-slate-700">Parcela {p.installmentNumber}</span>
                        <span className="text-sm font-medium text-slate-500 ml-3">Venc: {new Date(p.dueDate).toLocaleDateString()}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-black text-slate-800">R$ {p.amount.toFixed(2)}</span>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {p.status === 'paid' ? 'PAGO' : 'PENDENTE'}
                        </span>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="px-8 py-6 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
              <button onClick={() => setCarneToDelete(null)} disabled={isDeleting} className="px-6 py-3 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancelar</button>
              <button onClick={() => handleBulkDelete(carneSelectedPayments, true)} disabled={isDeleting || carneSelectedPayments.length === 0} className="px-6 py-3 text-sm font-bold text-white bg-red-600 rounded-xl hover:bg-red-700 flex items-center gap-2 shadow-lg shadow-red-600/20 disabled:opacity-50">
                <Trash2 size={16} /> Excluir {carneSelectedPayments.length} Avaliados
              </button>
            </div>
          </div>
        </div>
      )}

      {paymentToEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-transparent animate-in fade-in duration-200">
          <form onSubmit={handleEditSave} className="bg-white rounded-3xl w-full max-w-md shadow-xl overflow-hidden flex flex-col relative animate-slide-up">
            <div className="px-8 py-6 border-b border-slate-100 bg-slate-50/50">
              <h3 className="text-xl font-black text-slate-800 tracking-tight">Editar Cobrança</h3>
            </div>
            <div className="p-8 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Valor (R$)</label>
                <input type="number" step="0.01" min="1" required className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl px-4 py-3 font-medium outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20" value={editValue} onChange={e => setEditValue(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Vencimento</label>
                <input type="date" required className="w-full bg-slate-50 border border-slate-200 text-slate-800 text-sm rounded-xl px-4 py-3 font-medium outline-none focus:bg-white focus:border-indigo-400 focus:ring-4 focus:ring-indigo-400/20" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
            </div>
            <div className="px-8 py-6 bg-slate-50 flex justify-end gap-3 border-t border-slate-100">
              <button type="button" onClick={() => setPaymentToEdit(null)} disabled={isEditing} className="px-6 py-3 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">Cancelar</button>
              <button type="submit" disabled={isEditing} className="px-6 py-3 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50">Salvar Alterações</button>
            </div>
          </form>
        </div>
      )}
      {showInstallmentSelectModal && (
        <div className="fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl my-auto relative overflow-hidden animate-slide-up">
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Selecione o Parcelamento</h3>
                <p className="text-sm text-slate-500 mt-1">Este aluno tem mais de um carnê gerado no sistema. Escolha qual quer imprimir.</p>
              </div>
              <button onClick={() => setShowInstallmentSelectModal(false)} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90"><X size={24} /></button>
            </div>
            <div className="p-8 space-y-4 max-h-[60vh] overflow-y-auto">
              {availableInstallments.map((inst) => (
                <div key={inst.id} className="flex items-center justify-between p-4 border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50/30 transition-all">
                  <div>
                    <h4 className="font-bold text-slate-800">{inst.description}</h4>
                    <p className="text-sm text-slate-500">{inst.count} parcelas vinculadas • Total: <span className="font-bold text-green-600">R$ {inst.total.toFixed(2)}</span></p>
                  </div>
                  <button onClick={() => { setShowInstallmentSelectModal(false); executePrintCarne(inst.id); }} className="px-4 py-2 bg-indigo-100 text-indigo-700 font-bold rounded-xl hover:bg-indigo-200 transition-colors flex items-center gap-2">
                    <Printer size={18} /> Imprimir este Carnê
                  </button>
                </div>
              ))}
            </div>
            <div className="p-8 pt-0 flex justify-end">
              <button onClick={() => setShowInstallmentSelectModal(false)} className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}
      {showPrintCarneModal && (
        <div className="fixed inset-0 bg-transparent flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl my-auto relative overflow-hidden animate-slide-up">
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>

            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight">Imprimir Carnê</h3>
                <p className="text-sm text-slate-500 mt-1">Selecione o aluno para buscar e imprimir o carnê completo do Asaas.</p>
              </div>
              <button onClick={() => setShowPrintCarneModal(false)} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90"><X size={24} /></button>
            </div>

            <div className="p-8 space-y-8">
              <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                <SearchableSelect
                  label="Aluno"
                  placeholder="Pesquise pelo nome do aluno..."
                  required
                  options={data.students.map(s => ({
                    id: s.id,
                    name: s.name
                  }))}
                  value={selectedStudentForCarne}
                  onChange={setSelectedStudentForCarne}
                />
              </div>

              <div className="flex justify-end gap-4 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowPrintCarneModal(false)}
                  className="px-6 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedStudentForCarne) {
                      checkInstallmentsForStudent(selectedStudentForCarne);
                      setShowPrintCarneModal(false);
                      setSelectedStudentForCarne('');
                    } else {
                      showAlert('Atenção', 'Selecione um aluno primeiro.', 'warning');
                    }
                  }}
                  disabled={!selectedStudentForCarne || isFetchingCarne}
                  className="px-8 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md shadow-indigo-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-lg"
                >
                  {isFetchingCarne ? <RefreshCw size={20} className="animate-spin" /> : <Printer size={20} />}
                  Imprimir Carnê
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Supabase Manager Modal */}
      {showSupabaseModal && (
        <div className="fixed inset-0 bg-transparent flex items-center justify-center p-4 z-[60] overflow-hidden animate-in fade-in">
          <div className="bg-white rounded-2xl w-full max-w-6xl h-[90vh] shadow-2xl flex flex-col relative overflow-hidden animate-slide-up">
            <div className="bg-slate-800 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                  <Database className="text-slate-600" /> Gerenciador de Cobranças (Supabase)
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  Visualize e gerencie a tabela <code className="bg-slate-100 px-1.5 py-0.5 rounded text-indigo-600 font-bold">alunos_cobrancas</code>.
                </p>
              </div>
              <div className="flex items-center gap-4">
                <div className="relative w-64">
                   <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                   <input 
                    type="text" 
                    placeholder="Filtrar por nome/ID..." 
                    value={supabaseSearch}
                    onChange={(e) => setSupabaseSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none"
                   />
                </div>
                <button 
                  onClick={fetchSupabaseRecords}
                  disabled={isFetchingSupabase}
                  className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                >
                  <RefreshCw size={20} className={isFetchingSupabase ? 'animate-spin' : ''} />
                </button>
                <button onClick={() => setShowSupabaseModal(false)} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90">
                  <X size={24} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto p-4">
              <div className="min-w-full overflow-hidden rounded-xl border border-slate-100 shadow-sm">
                <table className="w-full text-left border-collapse bg-white">
                  <thead className="sticky top-0 bg-slate-50 z-10 border-b border-slate-200">
                    <tr className="text-[10px] uppercase font-black text-slate-400 tracking-wider">
                      <th className="p-4 w-12 text-center">
                        <input 
                          type="checkbox"
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                          checked={supabaseRecords.length > 0 && selectedSupabaseRows.length === supabaseRecords.length}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedSupabaseRows(supabaseRecords.map(r => r.asaas_payment_id));
                            } else {
                              setSelectedSupabaseRows([]);
                            }
                          }}
                        />
                      </th>
                      <th className="p-4">ID Asaas</th>
                      <th className="p-4">Aluno (ID)</th>
                      <th className="p-4">Valor</th>
                      <th className="p-4">Vencimento</th>
                      <th className="p-4">Status</th>
                      <th className="p-4">Link</th>
                      <th className="p-4 text-right">Ação</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {supabaseRecords
                      .filter(r => {
                        const searchLower = supabaseSearch.toLowerCase();
                        return (r.asaas_payment_id || '').toLowerCase().includes(searchLower) ||
                               (r.aluno_id || '').toLowerCase().includes(searchLower) ||
                               (r.status || '').toLowerCase().includes(searchLower);
                      })
                      .map((record) => (
                      <tr key={record.id} className={`hover:bg-slate-50/80 transition-colors text-xs ${selectedSupabaseRows.includes(record.asaas_payment_id) ? 'bg-indigo-50/50' : ''}`}>
                        <td className="p-4 text-center">
                          <input 
                            type="checkbox"
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            checked={selectedSupabaseRows.includes(record.asaas_payment_id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedSupabaseRows(prev => [...prev, record.asaas_payment_id]);
                              } else {
                                setSelectedSupabaseRows(prev => prev.filter(id => id !== record.asaas_payment_id));
                              }
                            }}
                          />
                        </td>
                        <td className="p-4 font-mono text-indigo-600 font-bold">{record.asaas_payment_id}</td>
                        <td className="p-4">
                          <div className="font-bold text-slate-700">
                            {data.students.find(s => s.id === record.aluno_id)?.name || 'N/A'}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{record.aluno_id}</div>
                        </td>
                        <td className="p-4 font-black text-slate-900">R$ {Number(record.valor).toFixed(2)}</td>
                        <td className="p-4 font-medium text-slate-600">{new Date(record.vencimento).toLocaleDateString('pt-BR')}</td>
                        <td className="p-4">
                          <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${
                            record.status === 'PAGO' ? 'bg-emerald-100 text-emerald-700' :
                            record.status === 'ATRASADO' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                          }`}>
                            {record.status}
                          </span>
                        </td>
                        <td className="p-4">
                          {record.link_boleto ? (
                            <a href={record.link_boleto} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline flex items-center gap-1">
                              <Barcode size={14} /> Link
                            </a>
                          ) : '-'}
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            onClick={() => {
                              if(confirm('Tem certeza que deseja excluir este registro diretamente do Supabase? Isso pode afetar a sincronização do Portal do Aluno.')) {
                                deleteSupabaseRecord(record.asaas_payment_id);
                              }
                            }}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {supabaseRecords.length === 0 && !isFetchingSupabase && (
                      <tr>
                        <td colSpan={7} className="p-12 text-center text-slate-400 italic">Nenhum registro encontrado na tabela alunos_cobrancas.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-between items-center">
              <div className="flex items-center gap-6">
                <div className="text-xs text-slate-500 font-medium">
                  Total de registros carregados: <span className="font-bold text-slate-800">{supabaseRecords.length}</span>
                </div>
                {selectedSupabaseRows.length > 0 && (
                  <div className="flex items-center gap-3 animate-in slide-in-from-left">
                    <span className="text-xs font-black text-red-600 bg-red-50 px-3 py-1 rounded-full border border-red-100 uppercase tracking-tighter">
                      {selectedSupabaseRows.length} selecionados
                    </span>
                    <button 
                      onClick={deleteSupabaseRecordsBulk}
                      className="flex items-center gap-2 bg-red-600 text-white px-4 py-1.5 rounded-lg text-xs font-bold hover:bg-red-700 transition-all shadow-md active:scale-95"
                    >
                      <Trash2 size={14} /> Excluir Selecionados
                    </button>
                  </div>
                )}
              </div>
              <button 
                onClick={() => setShowSupabaseModal(false)}
                className="px-8 py-3 bg-white border border-slate-200 text-slate-700 font-bold rounded-xl hover:bg-slate-100 transition-all shadow-sm"
              >
                Fechar Gerenciador
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Finance;