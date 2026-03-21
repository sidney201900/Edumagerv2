const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'components/Finance.tsx');
let content = fs.readFileSync(file, 'utf8');

// 1. Add State Variables
const statePoint = "const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);";
const newStates = `const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [selectedPayments, setSelectedPayments] = useState<string[]>([]);
  const [carneToDelete, setCarneToDelete] = useState<{ installmentId: string, payments: any[] } | null>(null);
  const [carneSelectedPayments, setCarneSelectedPayments] = useState<string[]>([]);`;
content = content.replace(statePoint, newStates);

// 2. Add handleBulkDelete function right below handleDelete
const handleDeleteEndReg = /setIsDeleting\(false\);\s*\}\s*\};/;
const bulkDeleteFunc = `setIsDeleting(false);
    }
  };

  const handleBulkDelete = async (ids: string[], isCarneContext = false) => {
    if (ids.length === 0 || isDeleting) return;
    setIsDeleting(true);
    let successCount = 0;
    let newPayments = [...data.payments];

    showAlert('Aguarde', \`Excluindo \${ids.length} cobranças no Asaas...\`, 'info');
    
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
      showAlert('Sucesso', \`\${successCount} exclusão(ões) concluída(s) com sucesso.\`, 'success');
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
  };`;
content = content.replace(handleDeleteEndReg, bulkDeleteFunc);

// 3. Add checkboxes to TODAS and AVULSAS tables
const selectTh = `<th className="px-6 py-4 border-b border-indigo-50 font-black text-[10px] uppercase tracking-wider text-indigo-900/60 break-words max-w-[150px]">Vencimento</th>`;
const newSelectTh = `<th className="w-12 px-6 py-4 border-b border-indigo-50"><input type="checkbox" className="rounded text-indigo-600 focus:ring-indigo-500" onChange={(e) => {
  if (e.target.checked) setSelectedPayments(filteredPayments.filter(p=>p.status !== 'paid').map(p=>p.id));
  else setSelectedPayments([]);
}} checked={selectedPayments.length > 0 && selectedPayments.length === filteredPayments.filter(p=>p.status !== 'paid').length} /></th>\n\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t\t` + selectTh;

content = content.split(selectTh).join(newSelectTh);

const tdIndex = `className="hover:bg-indigo-50/30 transition-colors group bg-white"`
const newTd = `className="hover:bg-indigo-50/30 transition-colors group bg-white">
<td className="px-6 py-5"><input type="checkbox" disabled={payment.status === 'paid'} checked={selectedPayments.includes(payment.id)} onChange={(e) => {
  if (e.target.checked) setSelectedPayments(prev => [...prev, payment.id]);
  else setSelectedPayments(prev => prev.filter(id => id !== payment.id));
}} className="rounded text-indigo-600 focus:ring-indigo-500 disabled:opacity-50" /></td>`;
// Ensure we inject correctly without duplicating if `group` isn't there
content = content.replace(/<tr key=\{payment\.id\} className="hover:bg-indigo-50\/30 transition-colors group bg-white">/g, `<tr key={payment.id} className="hover:bg-indigo-50/30 transition-colors group bg-white"><td className="px-6 py-5"><input type="checkbox" disabled={payment.status === 'paid'} checked={selectedPayments.includes(payment.id)} onChange={e => { if (e.target.checked) setSelectedPayments(prev => [...prev, payment.id]); else setSelectedPayments(prev => prev.filter(id => id !== payment.id)); }} className="rounded text-indigo-600 disabled:opacity-50" /></td>`);

// 4. Change the Trash button for the Carnê group
content = content.replace(
  /onClick=\{\(\) => openDelete\(\{ \.\.\.group\.payments\[0\], id: group\.installmentId, installmentId: group\.installmentId, asaasIdParaExcluir: group\.installmentId \} as any\)\}/g,
  `onClick={() => { setCarneToDelete(group); setCarneSelectedPayments(group.payments.filter(p => p.status !== 'paid').map(p => p.id)); }}`
);

// 5. Inject Bulk delete button for main list
const tabsNav = `<div className="flex bg-slate-100/50 p-1.5 rounded-xl self-start overflow-x-auto w-full md:w-auto">`;
const bulkBtn = `{selectedPayments.length > 0 && (
  <button onClick={() => handleBulkDelete(selectedPayments)} disabled={isDeleting} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg font-bold text-sm border border-red-100 hover:bg-red-100 inline-flex items-center gap-2 transition-colors">
    <Trash2 size={16} /> Excluir {selectedPayments.length} selecionados
  </button>
)}
`;
content = content.replace(tabsNav, bulkBtn + tabsNav);

// 6. Inject the CarneDeleteModal before the existing Modals
const modalInjectionPoint = `{showPrintCarneModal && (`;
const carneModal = `
{carneToDelete && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
    <div className="bg-white rounded-3xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]">
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
            <label key={p.id} className={\`flex items-center gap-4 p-4 rounded-xl border \${p.status === 'paid' ? 'bg-slate-50 border-slate-100 opacity-60' : 'bg-white border-slate-200 cursor-pointer hover:border-indigo-300'}\`}>
              <input type="checkbox" disabled={p.status === 'paid'} checked={carneSelectedPayments.includes(p.id)} onChange={e => {
                if (e.target.checked) setCarneSelectedPayments(prev => [...prev, p.id]);
                else setCarneSelectedPayments(prev => prev.filter(id => id !== p.id));
              }} className="rounded text-indigo-600 w-5 h-5 focus:ring-indigo-500 disabled:opacity-50" />
              <div className="flex-1 flex justify-between items-center">
                <div>
                  <span className="font-bold text-slate-700">Parcela {p.installmentNumber}</span>
                  <span className="text-sm font-medium text-slate-500 ml-3">Venc: {new Date(p.dueDate).toLocaleDateString()}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-black text-slate-800">R$ {p.amount.toFixed(2)}</span>
                  <span className={\`text-[10px] font-black uppercase px-2 py-0.5 rounded-full \${p.status === 'paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}\`}>
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
` + modalInjectionPoint;

content = content.replace(modalInjectionPoint, carneModal);

fs.writeFileSync(file, content, 'utf8');
console.log('Successfully injected Multi-Select and Bulk Delete logic.');
