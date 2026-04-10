import React, { useState } from 'react';
import { SchoolData } from '../types';
import { useDialog } from '../DialogContext';
import { MessageSquare, Save, Info, Settings, Send, Clock, AlertTriangle, FileText, CheckCircle, Cake } from 'lucide-react';

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

      return { nome, telefone };
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
          <Save size={18} /> Salvar Alterações
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Lado Esquerdo - Variáveis e Configurações */}
        <div className="space-y-6">
          <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-xl shadow-sm">
            <h3 className="font-bold text-indigo-800 flex items-center gap-2 mb-4">
              <Info size={18} /> Variáveis Dinâmicas
            </h3>
            <p className="text-sm text-indigo-700/80 mb-4">
              Você pode utilizar os códigos abaixo em seus textos. Eles serão substituídos automaticamente pelas informações do sistema no envio.
            </p>
            <ul className="space-y-2 text-sm text-indigo-800 font-medium">
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{nome}'}</code> - Nome do destinatário (Aluno ou Responsável)</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{descricao}'}</code> - Descrição da cobrança no Asaas</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{valor}'}</code> - Valor da cobrança</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{vencimento}'}</code> - Data de Vencimento</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{link_boleto}'}</code> - Link para PDF/Pgto</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{escola}'}</code> - Nome da Escola</li>
            </ul>
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xl">
            <h3 className="font-black text-slate-800 flex items-center gap-2 mb-6">
              <Clock size={20} className="text-indigo-600" /> Automação de Cobrança
            </h3>
            
            <div className="space-y-5">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={templates.automationRules.sendOnDueDate}
                  onChange={(e) => setTemplates(p => ({ ...p, automationRules: { ...p.automationRules, sendOnDueDate: e.target.checked } }))}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm font-semibold text-slate-700">Enviar aviso no dia do vencimento</span>
              </label>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Enviar 1º aviso de atraso após</label>
                <div className="flex items-center gap-3 text-sm text-slate-700 font-medium">
                  <input 
                    type="number" min="1" max="30"
                    value={templates.automationRules.sendDaysAfter}
                    onChange={(e) => setTemplates(p => ({ ...p, automationRules: { ...p.automationRules, sendDaysAfter: e.target.value } }))}
                    className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-center"
                  />
                  <span>dias do vencimento</span>
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Repetir cobrança de atrasados a cada</label>
                <div className="flex items-center gap-3 text-sm text-slate-700 font-medium">
                  <input 
                    type="number" min="1" max="30"
                    value={templates.automationRules.repeatEveryDays}
                    onChange={(e) => setTemplates(p => ({ ...p, automationRules: { ...p.automationRules, repeatEveryDays: e.target.value } }))}
                    className="w-20 px-3 py-2 border border-slate-200 rounded-lg text-center"
                  />
                  <span>dias</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 p-6 rounded-xl shadow-lg">
            <h3 className="font-black text-amber-800 flex items-center gap-2 mb-3">
              <AlertTriangle size={20} /> Ação Manual
            </h3>
            <p className="text-sm text-amber-700/80 mb-5 leading-relaxed">
              Use este botão para processar imediatamente todos os pagamentos marcados como "Atrasado" e enviar o modelo "Boleto Vencido" para os responsáveis.
            </p>
            <button 
              onClick={handleDispararCobrancas}
              disabled={isSending || !data.evolutionConfig?.apiUrl}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-white shadow-md transition-all ${
                isSending || !data.evolutionConfig?.apiUrl 
                ? 'bg-slate-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 hover:scale-[1.02]'
              }`}
            >
              {isSending ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Conectando API...
                </>
              ) : (
                <>
                  <Send size={18} /> Disparar Cobranças Atrasadas Agora
                </>
              )}
            </button>
            {!data.evolutionConfig?.apiUrl && (
              <p className="mt-3 text-xs text-amber-700 text-center font-medium">Configure a Evolution API nas Configurações.</p>
            )}
          </div>

          <div className="bg-gradient-to-br from-pink-50 to-rose-50 border border-pink-200 p-6 rounded-xl shadow-lg">
            <h3 className="font-black text-pink-800 flex items-center gap-2 mb-3">
              <Cake size={20} /> Aniversariantes do Dia
            </h3>
            <p className="text-sm text-pink-700/80 mb-5 leading-relaxed">
              O sistema identificou <strong>{birthdayStudents.length}</strong> alunos fazendo aniversário hoje ({new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}).
            </p>
            <button 
              onClick={handleSendBirthdays}
              disabled={isSendingBdays || birthdayStudents.length === 0 || !data.evolutionConfig?.apiUrl}
              className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-white shadow-md transition-all ${
                isSendingBdays || birthdayStudents.length === 0 || !data.evolutionConfig?.apiUrl
                ? 'bg-slate-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 hover:scale-[1.02]'
              }`}
            >
              {isSendingBdays ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                  Processando...
                </>
              ) : (
                <>
                  <Cake size={18} /> Parabenizar Aniversariantes Now
                </>
              )}
            </button>
            {birthdayStudents.length > 0 && (
              <div className="mt-4 space-y-1 max-h-32 overflow-y-auto">
                {birthdayStudents.map(s => (
                  <div key={s.id} className="text-[11px] font-bold text-pink-600 bg-white/40 px-2 py-1 rounded flex justify-between">
                    <span>{s.name}</span>
                    <span className="opacity-60">{s.phone || s.guardianPhone || 'S/ Tel'}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-emerald-50 border border-emerald-200 p-6 rounded-xl shadow-lg mt-8">
            <h3 className="font-black text-emerald-800 flex items-center gap-2 mb-3">
              <MessageSquare size={20} /> Disparo em Massa (Anti-Ban)
            </h3>
            <p className="text-sm text-emerald-700/80 mb-5 leading-relaxed">
              Dispare mensagens personalizadas sem risco de bloqueio. O sistema enviará em segundo plano com pausas de 1 a 3 minutos entre envios.
            </p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-emerald-700 uppercase mb-2">Público-Alvo</label>
                <select 
                  className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white focus:ring-emerald-500"
                  value={targetType}
                  onChange={(e) => { setTargetType(e.target.value); setTargetId(''); }}
                >
                  <option value="todos">Todos os Alunos</option>
                  <option value="turma">Uma Turma Específica</option>
                  <option value="aluno">Um Aluno Específico</option>
                </select>
              </div>

              {targetType === 'turma' && (
                <div>
                  <label className="block text-xs font-bold text-emerald-700 uppercase mb-2">Selecione a Turma</label>
                  <select 
                    className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  >
                    <option value="">-- Escolha a Turma --</option>
                    {data.classes?.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {targetType === 'aluno' && (
                <div>
                  <label className="block text-xs font-bold text-emerald-700 uppercase mb-2">Selecione o Aluno</label>
                  <select 
                    className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white"
                    value={targetId}
                    onChange={(e) => setTargetId(e.target.value)}
                  >
                    <option value="">-- Escolha o Aluno --</option>
                    {data.students?.map(s => <option key={s.id} value={s.id}>{s.name} ({s.cpf})</option>)}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-emerald-700 uppercase mb-2">Mensagem</label>
                <textarea 
                  rows={4}
                  className="w-full px-3 py-2 border border-emerald-200 rounded-lg text-sm bg-white focus:ring-emerald-500"
                  placeholder="Escreva sua mensagem aqui..."
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                />
                <p className="text-[11px] text-emerald-600 font-medium mt-1">Dica: Use {"{nome}"} para personalizar a mensagem com o nome de cada destinatário.</p>
              </div>

              <button 
                onClick={handleMassSend}
                disabled={isSendingMass || !data.evolutionConfig?.apiUrl}
                className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-bold text-sm text-white shadow-md transition-all ${
                  isSendingMass || !data.evolutionConfig?.apiUrl
                  ? 'bg-slate-400 cursor-not-allowed'
                  : 'bg-emerald-600 hover:bg-emerald-700 hover:scale-[1.02]'
                }`}
              >
                {isSendingMass ? (
                  <><div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> Iniciando...</>
                ) : (
                  <><Send size={18} /> Iniciar Disparo</>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Lado Direito - Textareas */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <FileText size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Boleto Gerado / Novo Carnê</h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Enviado assim que a cobrança é criada</p>
              </div>
            </div>
            <textarea 
              value={templates.boletoGerado}
              onChange={(e) => setTemplates(p => ({ ...p, boletoGerado: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y text-slate-700 text-sm font-medium"
            />
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                <CheckCircle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Pagamento Confirmado</h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Enviado quando o sistema (Asaas) compensa o pagamento</p>
              </div>
            </div>
            <textarea 
              value={templates.pagamentoConfirmado}
              onChange={(e) => setTemplates(p => ({ ...p, pagamentoConfirmado: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y text-slate-700 text-sm font-medium"
            />
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xl border-t-4 border-t-red-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Boleto Vencido</h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Enviado conforme automação ou disparo manual</p>
              </div>
            </div>
            <textarea 
              value={templates.boletoVencido}
              onChange={(e) => setTemplates(p => ({ ...p, boletoVencido: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y text-slate-700 text-sm font-medium"
            />
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xl">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center text-slate-500">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Cobrança Cancelada / Excluída</h3>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Enviado quando o boleto for cancelado no sistema</p>
              </div>
            </div>
            <textarea 
              value={templates.cobrancaCancelada}
              onChange={(e) => setTemplates(p => ({ ...p, cobrancaCancelada: e.target.value }))}
              rows={3}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y text-slate-700 text-sm font-medium"
            />
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xl border-t-4 border-t-amber-400">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                <Settings size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Cobrança Atualizada / Alterada</h3>
                <p className="text-[11px] font-bold text-amber-500 uppercase tracking-widest">Enviado quando houver edição/atualização da cobrança</p>
              </div>
            </div>
            <textarea 
              value={templates.cobrancaAtualizada}
              onChange={(e) => setTemplates(p => ({ ...p, cobrancaAtualizada: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 resize-y text-slate-700 text-sm font-medium"
            />
          </div>

          <div className="bg-white border border-slate-200 p-6 rounded-xl shadow-xl border-t-4 border-t-pink-500">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-full bg-pink-50 flex items-center justify-center text-pink-600">
                <Cake size={20} />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-lg">Feliz Aniversário</h3>
                <p className="text-[11px] font-bold text-pink-500 uppercase tracking-widest">Mensagem para os aniversariantes do dia</p>
              </div>
            </div>
            <textarea 
              value={templates.felizAniversario}
              onChange={(e) => setTemplates(p => ({ ...p, felizAniversario: e.target.value }))}
              rows={4}
              className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-500 resize-y text-slate-700 text-sm font-medium"
            />
            <p className="mt-3 text-[11px] text-slate-500 font-medium">Use {"{nome}"} para o nome do aluno e {"{escola}"} para o nome da escola.</p>
          </div>

        </div>

      </div>
    </div>
  );
};

export default Messages;
