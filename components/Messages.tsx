import React, { useState } from 'react';
import { SchoolData } from '../types';
import { useDialog } from '../DialogContext';
import { MessageSquare, Save, Info, Settings, Send, Clock, AlertTriangle, FileText, CheckCircle, Cake, X } from 'lucide-react';

interface MessagesProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const defaultTemplates = {
  boletoGerado: "Olá {nome}, sua cobrança referente a {descricao} no valor de R$ {valor} foi gerada. Vencimento: {vencimento}.",
  pagamentoConfirmado: "Olá {nome}, confirmamos o pagamento de R$ {valor} referente a {descricao}. Muito obrigado!",
  boletoVencido: "Olá {nome}, o boleto referente a {descricao} de R$ {valor} venceu em {vencimento}. Segue o PDF da 2ª via atualizada abaixo:",
  cobrancaCancelada: "Olá {nome}, a cobrança referente a {descricao} foi cancelada.",
  cobrancaAtualizada: "Olá {nome}, o boleto de {descricao} foi atualizado. Segue a nova versão:",
  felizAniversario: "Olá {nome}, a equipe da {escola} passa para te desejar um Feliz Aniversário! Muita saúde, paz e conquistas neste novo ciclo! 🎂🎈",
  automationRules: {
    sendOnDueDate: true,
    sendDaysAfter: '1',
    repeatEveryDays: '3'
  }
};

const Messages: React.FC<MessagesProps> = ({ data, updateData }) => {
  const { showAlert, showConfirm } = useDialog();
  const defaultVars = data.messageTemplates || defaultTemplates;
  const initRules = defaultVars.automationRules || defaultTemplates.automationRules;
  
  const [templates, setTemplates] = useState({
    ...defaultTemplates,
    ...defaultVars,
    automationRules: {
      ...defaultTemplates.automationRules,
      ...initRules
    }
  });

  const [isSending, setIsSending] = useState(false);

  // Estados WhatsApp em Massa
  const [targetType, setTargetType] = useState('todos');
  const [targetId, setTargetId] = useState('');
  const [messageText, setMessageText] = useState('');
  const [isSendingMass, setIsSendingMass] = useState(false);
  const [isSendingBdays, setIsSendingBdays] = useState(false);
  
  // Modal de Edição de Modelo
  const [editingTemplate, setEditingTemplate] = useState<{
    key: keyof typeof defaultTemplates | 'felizAniversario', 
    label: string, 
    desc: string, 
    color: string, 
    icon: any,
    vars: string[]
  } | null>(null);

  const normalizeLineBreaks = (text: string) => text.replace(/\r\n/g, '\n');

  const birthdayStudents = (data.students || []).filter(s => {
    if (!s.birthDate || s.status !== 'active') return false;
    const bdayParts = s.birthDate.split('-');
    const bdayDay = parseInt(bdayParts[2]);
    const bdayMonth = parseInt(bdayParts[1]);
    const today = new Date();
    return bdayDay === today.getDate() && bdayMonth === (today.getMonth() + 1);
  });

  const handleSendBirthdays = async () => {
    if (birthdayStudents.length === 0) return;
    
    showConfirm(
      'Enviar Felicitações',
      `Deseja enviar a mensagem de aniversário para os ${birthdayStudents.length} alunos que fazem aniversário hoje?`,
      async () => {
        setIsSendingBdays(true);
        try {
          const payloadAlunos = birthdayStudents.map(s => {
            const nome = s.name.split(' ')[0];
            const telefone = s.phone || s.guardianPhone;
            return { nome, telefone };
          }).filter(a => a.telefone);

          if (payloadAlunos.length === 0) {
            showAlert('Aviso', 'Nenhum dos aniversariantes possui telefone cadastrado.', 'warning');
            return;
          }

          const msgTemplate = normalizeLineBreaks(templates.felizAniversario).replace(/{escola}/g, data.profile.name);

          const resp = await fetch('/api/enviar-massa', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ alunos: payloadAlunos, mensagem: msgTemplate })
          });
          
          if (resp.ok) {
            showAlert('Sucesso', 'O disparo das mensagens de aniversário foi iniciado!', 'success');
          } else {
            const resData = await resp.json();
            showAlert('Erro', resData.error || 'Erro ao iniciar disparo.', 'error');
          }
        } catch (e) {
          showAlert('Erro', 'Erro de conexão.', 'error');
        } finally {
          setIsSendingBdays(false);
        }
      }
    );
  };

  const handleSave = () => {
    const normalizedTemplates = {
      ...templates,
      boletoGerado: normalizeLineBreaks(templates.boletoGerado),
      pagamentoConfirmado: normalizeLineBreaks(templates.pagamentoConfirmado),
      boletoVencido: normalizeLineBreaks(templates.boletoVencido),
      cobrancaCancelada: normalizeLineBreaks(templates.cobrancaCancelada),
      cobrancaAtualizada: normalizeLineBreaks(templates.cobrancaAtualizada),
      felizAniversario: normalizeLineBreaks(templates.felizAniversario)
    };
    updateData({ messageTemplates: normalizedTemplates });
    showAlert('Sucesso', 'Configurações de mensagens salvas com sucesso!', 'success');
  };

  const handleDispararCobrancas = async () => {
    showConfirm(
      'Disparar Cobranças',
      'Tem certeza que deseja processar e enviar as mensagens para TODOS os alunos com pagamentos atrasados agora?',
      async () => {
        setIsSending(true);
        try {
          const resp = await fetch('/api/disparar_cobrancas', { method: 'POST' });
          const resData = await resp.json();
          if (resp.ok) {
            showAlert('Sucesso', resData.message || 'Cobranças processadas e disparadas com sucesso!', 'success');
          } else {
            showAlert('Erro', resData.error || 'Erro ao disparar cobranças', 'error');
          }
        } catch (e: any) {
          showAlert('Erro', 'Erro de conexão ao disparar cobranças.', 'error');
        } finally {
          setIsSending(false);
        }
      }
    );
  };

  const handleMassSend = async () => {
    if (!messageText.trim()) {
      return showAlert('Aviso', 'Digite uma mensagem para enviar.', 'warning');
    }

    let targetStudents = [];
    if (targetType === 'todos') {
      targetStudents = data.students || [];
    } else if (targetType === 'turma') {
      if (!targetId) return showAlert('Aviso', 'Selecione uma turma.', 'warning');
      targetStudents = (data.students || []).filter(s => s.classId === targetId);
    } else if (targetType === 'aluno') {
      if (!targetId) return showAlert('Aviso', 'Selecione um aluno.', 'warning');
      targetStudents = (data.students || []).filter(s => s.id === targetId);
    }

    const validStudents = targetStudents.filter(a => a.phone || a.guardianPhone);
    if (validStudents.length === 0) {
      return showAlert('Erro', 'Nenhum aluno com telefone cadastrado foi selecionado.', 'error');
    }

    const payloadAlunos = validStudents.map(a => {
      let nome = a.name;
      let telefone = a.phone;
      
      if (a.birthDate) {
        const birthDate = new Date(a.birthDate);
        const age = Math.abs(new Date(Date.now() - birthDate.getTime()).getUTCFullYear() - 1970);
        if (age < 18) {
          nome = a.guardianName || a.name;
          telefone = a.guardianPhone || a.phone;
        }
      }

      return { nome, telefone, matricula: a.enrollmentNumber || '—' };
    });

    setIsSendingMass(true);
    try {
      const resp = await fetch('/api/enviar-massa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alunos: payloadAlunos, mensagem: normalizeLineBreaks(messageText) })
      });
      const resData = await resp.json();
      
      if (resp.ok) {
        setMessageText('');
        setTargetId('');
        showAlert('Sucesso', 'Disparo iniciado no servidor! Você já pode fechar esta tela ou continuar usando o sistema.', 'success');
      } else {
        showAlert('Erro', resData.error || 'Erro ao iniciar disparo.', 'error');
      }
    } catch (e) {
      showAlert('Erro', 'Erro de conexão.', 'error');
    } finally {
      setIsSendingMass(false);
    }
  };

  const templateCards = [
    { key: 'boletoGerado', label: 'Boleto Gerado / Novo Carnê', desc: 'Enviado assim que a cobrança é criada no sistema.', color: 'blue', icon: FileText, vars: ['{nome}', '{matricula}', '{descricao}', '{valor}', '{vencimento}', '{link_boleto}', '{escola}'] },
    { key: 'pagamentoConfirmado', label: 'Pagamento Confirmado', desc: 'Enviado quando o sistema (Asaas) compensa o pagamento.', color: 'emerald', icon: CheckCircle, vars: ['{nome}', '{matricula}', '{descricao}', '{valor}', '{escola}'] },
    { key: 'boletoVencido', label: 'Boleto Vencido', desc: 'Enviado conforme automação ou disparo manual de atrasados.', color: 'red', icon: AlertTriangle, vars: ['{nome}', '{matricula}', '{descricao}', '{valor}', '{vencimento}', '{link_boleto}', '{escola}'] },
    { key: 'cobrancaCancelada', label: 'Cobrança Cancelada', desc: 'Enviado quando o boleto for cancelado no sistema.', color: 'slate', icon: AlertTriangle, vars: ['{nome}', '{matricula}', '{descricao}', '{escola}'] },
    { key: 'cobrancaAtualizada', label: 'Cobrança Atualizada', desc: 'Enviado quando houver edição/atualização da cobrança.', color: 'amber', icon: Settings, vars: ['{nome}', '{matricula}', '{descricao}', '{valor}', '{vencimento}', '{link_boleto}', '{escola}'] },
    { key: 'felizAniversario', label: 'Feliz Aniversário', desc: 'Mensagem carinhosa para os aniversariantes do dia.', color: 'pink', icon: Cake, vars: ['{nome}', '{escola}'] }
  ];

  const insertVariable = (variable: string) => {
    if (!editingTemplate) return;
    const textarea = document.getElementById('template-editor') as HTMLTextAreaElement;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = (templates[editingTemplate.key as keyof typeof templates] as string) || '';
    const newText = text.substring(0, start) + variable + text.substring(end);
    
    setTemplates(p => ({ ...p, [editingTemplate.key]: newText }));
    
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 10);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-20">
      <header className="flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Mensagens</h2>
          <p className="text-slate-500 font-medium mt-1">Configure modelos e rotinas de notificação via WhatsApp.</p>
        </div>
        <button 
          onClick={handleSave}
          className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all"
        >
          <Save size={18} /> Salvar Tudo
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Lado Esquerdo - Configurações e Disparos */}
        <div className="space-y-6">
          
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-xl">
            <h3 className="font-black text-slate-800 flex items-center gap-2 mb-6 text-sm uppercase tracking-widest text-indigo-600">
              <Clock size={18} /> Automação
            </h3>
            
            <div className="space-y-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={templates.automationRules.sendOnDueDate}
                  onChange={(e) => setTemplates(p => ({ ...p, automationRules: { ...p.automationRules, sendOnDueDate: e.target.checked } }))}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-bold text-slate-700">Aviso no dia do vencimento</span>
              </label>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">1º aviso após</label>
                <div className="flex items-center gap-3 text-sm text-slate-700 font-bold">
                  <input 
                    type="number" min="1" max="30"
                    value={templates.automationRules.sendDaysAfter}
                    onChange={(e) => setTemplates(p => ({ ...p, automationRules: { ...p.automationRules, sendDaysAfter: e.target.value } }))}
                    className="w-16 px-3 py-2 border border-slate-200 rounded-lg text-center bg-white shadow-sm"
                  />
                  <span>dias</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Repetir a cada</label>
                <div className="flex items-center gap-3 text-sm text-slate-700 font-bold">
                  <input 
                    type="number" min="1" max="30"
                    value={templates.automationRules.repeatEveryDays}
                    onChange={(e) => setTemplates(p => ({ ...p, automationRules: { ...p.automationRules, repeatEveryDays: e.target.value } }))}
                    className="w-16 px-3 py-2 border border-slate-200 rounded-lg text-center bg-white shadow-sm"
                  />
                  <span>dias</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-2xl shadow-lg">
            <h3 className="font-black text-emerald-800 flex items-center gap-2 mb-4 text-sm uppercase tracking-widest">
              <MessageSquare size={18} /> Disparo em Massa
            </h3>
            
            <div className="space-y-4">
              <select 
                className="w-full px-3 py-2.5 border border-emerald-200 rounded-xl text-sm bg-white font-bold"
                value={targetType}
                onChange={(e) => { setTargetType(e.target.value); setTargetId(''); }}
              >
                <option value="todos">Todos os Alunos</option>
                <option value="turma">Uma Turma</option>
                <option value="aluno">Um Aluno</option>
              </select>

              {targetType !== 'todos' && (
                <select 
                  className="w-full px-3 py-2.5 border border-emerald-200 rounded-xl text-sm bg-white font-bold"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                >
                  <option value="">-- Selecione --</option>
                  {targetType === 'turma' 
                    ? data.classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)
                    : data.students?.map(s => <option key={s.id} value={s.id}>{s.name}</option>)
                  }
                </select>
              )}

              <div>
                <label className="block text-[10px] font-black text-emerald-600 uppercase mb-2 ml-1">Mensagem Personalizada</label>
                <div className="flex flex-wrap gap-1 mb-2">
                  {['{nome}', '{matricula}'].map(v => (
                    <button 
                      key={v}
                      onClick={() => {
                        const textarea = document.getElementById('mass-editor') as HTMLTextAreaElement;
                        if (!textarea) return;
                        const start = textarea.selectionStart;
                        const end = textarea.selectionEnd;
                        const newText = messageText.substring(0, start) + v + messageText.substring(end);
                        setMessageText(newText);
                        setTimeout(() => { textarea.focus(); textarea.setSelectionRange(start + v.length, start + v.length); }, 10);
                      }}
                      className="text-[9px] bg-emerald-100/50 text-emerald-700 px-2 py-1 rounded-md border border-emerald-200 hover:bg-emerald-600 hover:text-white transition-all shadow-sm"
                    >
                      {v}
                    </button>
                  ))}
                </div>
                <textarea 
                  id="mass-editor"
                  rows={4}
                  className="w-full px-3 py-3 border border-emerald-200 rounded-xl text-sm bg-white focus:ring-emerald-500 font-medium shadow-sm"
                  placeholder="Escreva sua mensagem..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
              </div>

              <button 
                onClick={handleMassSend}
                disabled={isSendingMass || !data.evolutionConfig?.apiUrl}
                className={`w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-black text-sm text-white transition-all shadow-lg active:scale-95 ${
                  isSendingMass || !data.evolutionConfig?.apiUrl ? 'bg-slate-400' : 'bg-emerald-600 hover:bg-emerald-700'
                }`}
              >
                {isSendingMass ? 'Iniciando...' : 'Iniciar Disparo'}
              </button>
            </div>
          </div>

          <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl shadow-lg">
            <h3 className="font-black text-amber-800 flex items-center gap-2 mb-3 text-sm uppercase tracking-widest">
              <AlertTriangle size={18} /> Inadimplência
            </h3>
            <button 
              onClick={handleDispararCobrancas}
              disabled={isSending || !data.evolutionConfig?.apiUrl}
              className={`w-full py-3.5 px-4 rounded-xl font-black text-sm text-white shadow-lg transition-all active:scale-95 ${
                isSending || !data.evolutionConfig?.apiUrl ? 'bg-slate-400' : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {isSending ? 'Processando...' : 'Disparar Cobranças Now'}
            </button>
          </div>

          <div className="bg-pink-50 border border-pink-200 p-6 rounded-2xl shadow-lg">
            <h3 className="font-black text-pink-800 flex items-center gap-2 mb-3 text-sm uppercase tracking-widest">
              <Cake size={18} /> Aniversariantes
            </h3>
            <button 
              onClick={handleSendBirthdays}
              disabled={isSendingBdays || birthdayStudents.length === 0 || !data.evolutionConfig?.apiUrl}
              className={`w-full flex items-center justify-center gap-2 py-3.5 px-4 rounded-xl font-black text-sm text-white shadow-xl transition-all active:scale-95 mb-4 ${
                isSendingBdays || birthdayStudents.length === 0 || !data.evolutionConfig?.apiUrl ? 'bg-slate-400' : 'bg-pink-500 hover:bg-pink-600'
              }`}
            >
              {isSendingBdays ? 'Enviando...' : 'Parabenizar Todos'}
            </button>

            <div className="pt-4 border-t border-pink-100">
              <label className="block text-[10px] font-black text-pink-400 uppercase tracking-widest mb-3">Próximos do Mês</label>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2 custom-scrollbar">
                {(data.students || []).filter(s => {
                  if (!s.birthDate || s.status !== 'active') return false;
                  return parseInt(s.birthDate.split('-')[1]) === (new Date().getMonth() + 1);
                }).sort((a,b) => parseInt(a.birthDate!.split('-')[2]) - parseInt(b.birthDate!.split('-')[2])).map(s => {
                  const day = s.birthDate?.split('-')[2];
                  return (
                    <div key={s.id} className="flex justify-between items-center text-[10px] font-bold text-pink-700 bg-white/40 p-2 rounded-lg border border-pink-100/50">
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 bg-pink-100 rounded-full flex items-center justify-center text-[9px]">{day}</span>
                        <span className="truncate max-w-[100px]">{s.name}</span>
                      </div>
                      <span className="opacity-60">{s.phone || 'S/ Tel'}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Lado Direito - Cards de Modelos */}
        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-6">
          {templateCards.map((card) => {
            const Icon = card.icon;
            const colors: any = {
              blue: 'bg-blue-50 text-blue-600',
              emerald: 'bg-emerald-50 text-emerald-600',
              red: 'bg-red-50 text-red-600',
              slate: 'bg-slate-50 text-slate-600',
              amber: 'bg-amber-50 text-amber-600',
              pink: 'bg-pink-50 text-pink-600',
            };
            
            return (
              <div 
                key={card.key}
                onClick={() => setEditingTemplate(card as any)}
                className="bg-white border border-slate-200 rounded-3xl p-6 cursor-pointer transition-all hover:shadow-2xl hover:-translate-y-1 group relative overflow-hidden active:scale-95"
              >
                <div className={`w-12 h-12 rounded-2xl ${colors[card.color]} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform shadow-sm`}>
                  <Icon size={24} />
                </div>
                <h4 className="font-black text-slate-800 text-lg mb-2">{card.label}</h4>
                <p className="text-xs text-slate-500 font-medium leading-relaxed">{card.desc}</p>
                <div className="mt-6 flex items-center gap-2 text-[10px] font-black text-indigo-600 uppercase tracking-widest border-t border-slate-50 pt-4">
                  Editar Modelo <Settings size={12} className="group-hover:rotate-45 transition-transform" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* MODAL DE EDIÇÃO */}
      {editingTemplate && (
        <div className="fixed inset-0 bg-transparent z-50 flex items-center justify-center p-4 animate-in fade-in duration-400">
          <div className="bg-white rounded-[2.5rem] w-full max-w-2xl shadow-2xl relative overflow-hidden animate-slide-up duration-400 border border-slate-100">
            <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div>
                <h3 className="text-xl font-black text-slate-800">{editingTemplate.label}</h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{editingTemplate.key}</p>
              </div>
              <button 
                onClick={() => setEditingTemplate(null)} 
                className="p-3 bg-white text-slate-400 hover:text-red-500 rounded-2xl shadow-md transition-all hover:rotate-90 border border-slate-100"
              >
                <X size={20} />
              </button>
            </div>
            
            <div className="p-8 space-y-6">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Clique para inserir variável</label>
                <div className="flex flex-wrap gap-2 text-[10px] font-black">
                  {editingTemplate.vars.map(v => (
                    <button 
                      key={v} 
                      onClick={() => insertVariable(v)} 
                      className="px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg hover:bg-indigo-600 hover:text-white transition-all active:scale-95 border border-indigo-100 shadow-sm"
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </div>

              <textarea 
                id="template-editor"
                value={(templates[editingTemplate.key as keyof typeof templates] as string) || ''}
                onChange={(e) => setTemplates(p => ({ ...p, [editingTemplate.key]: e.target.value }))}
                rows={10}
                className="w-full px-6 py-5 bg-slate-50 border-2 border-slate-100 rounded-[2rem] focus:border-indigo-500 focus:bg-white focus:outline-none transition-all text-slate-700 font-medium shadow-inner resize-none"
                placeholder="Escreva sua mensagem..."
              />

              <div className="flex gap-4">
                <button 
                  onClick={() => setEditingTemplate(null)} 
                  className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-sm hover:bg-slate-200 transition-all active:scale-95"
                >
                  Cancelar
                </button>
                <button 
                  onClick={() => { handleSave(); setEditingTemplate(null); }} 
                  className="flex-1 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm hover:bg-indigo-700 shadow-xl shadow-indigo-100 transition-all active:scale-95"
                >
                  Salvar Modelo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Messages;
