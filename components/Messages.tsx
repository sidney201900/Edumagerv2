import React, { useState } from 'react';
import { SchoolData } from '../types';
import { useDialog } from '../DialogContext';
import { MessageSquare, Save, Info, Settings, Send, Clock, AlertTriangle, FileText, CheckCircle } from 'lucide-react';

interface MessagesProps {
  data: SchoolData;
  updateData: (newData: Partial<SchoolData>) => void;
}

const defaultTemplates = {
  boletoGerado: "Olá {nome}, o boleto do(a) aluno(a) {nome_aluno} no valor de R$ {valor} com vencimento em {vencimento} já está disponível! Link: {link_boleto}",
  pagamentoConfirmado: "Olá {nome}, confirmamos o pagamento do(a) aluno(a) {nome_aluno} no valor de R$ {valor}. Agradecemos a pontualidade!",
  boletoVencido: "Olá {nome}, notamos que o boleto do(a) aluno(a) {nome_aluno} no valor de R$ {valor} (vencimento em {vencimento}) encontra-se em aberto. Para emitir ou pagar, acesse o link: {link_boleto}",
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
    boletoGerado: defaultVars.boletoGerado || defaultTemplates.boletoGerado,
    pagamentoConfirmado: defaultVars.pagamentoConfirmado || defaultTemplates.pagamentoConfirmado,
    boletoVencido: defaultVars.boletoVencido || defaultTemplates.boletoVencido,
    automationRules: {
      sendOnDueDate: initRules.sendOnDueDate !== undefined ? initRules.sendOnDueDate : true,
      sendDaysAfter: initRules.sendDaysAfter || '1',
      repeatEveryDays: initRules.repeatEveryDays || '3'
    }
  });

  const [isSending, setIsSending] = useState(false);

  const handleSave = () => {
    updateData({ messageTemplates: templates });
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
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{nome_aluno}'}</code> - Nome do Aluno</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{valor}'}</code> - Valor da cobrança</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{vencimento}'}</code> - Data de Vencimento</li>
              <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> <code className="bg-white/60 px-2 py-0.5 rounded text-indigo-900">{'{link_boleto}'}</code> - Link para PDF/Pgto</li>
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
        </div>

      </div>
    </div>
  );
};

export default Messages;
