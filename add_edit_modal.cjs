const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, 'components/Finance.tsx');
let content = fs.readFileSync(file, 'utf8');
let changes = 0;

// 1. Extend the name column width
const classTh = '<th className="px-6 py-4">Aluno / Descrição</th>';
content = content.replace(classTh, '<th className="px-6 py-4 whitespace-nowrap min-w-[200px]">Aluno / Descrição</th>');

const classTd = '<td className="px-6 py-5">';
// Note: <td className="px-6 py-5">
// Wait, the column wrapping student?.name is exactly `px-6 py-5`. If we make it `px-6 py-5 whitespace-nowrap min-w-[200px] max-w-[300px] truncate`, it will be perfectly inline.
content = content.replace(/<td className="px-6 py-5">\s*<div className="font-bold text-slate-900 flex items-center gap-2">\s*\{student\?\.name \|\| 'Aluno Removido'\}/g, '<td className="px-6 py-5 whitespace-nowrap min-w-[250px]"><div className="font-bold text-slate-900 flex items-center gap-2 truncate max-w-[250px]">{student?.name || \'Aluno Removido\'}');

// 2. Add Edit Modal State
const stateInjection = 'const [carneSelectedPayments, setCarneSelectedPayments] = useState<string[]>([]);';
const editState = `${stateInjection}
  const [paymentToEdit, setPaymentToEdit] = useState<Payment | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editDate, setEditDate] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
`;
if (!content.includes('paymentToEdit')) {
  content = content.replace(stateInjection, editState);
  changes++;
}

// 3. Add handleEditSave function
const handleDeleteEndReg = /setIsDeleting\(false\);\s*\}\s*\};/;
const editFunction = `setIsDeleting(false);
    }
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentToEdit || isEditing) return;
    setIsEditing(true);
    try {
      showAlert('Aguarde', 'Salvando alterações no Asaas...', 'info');
      const response = await fetch(\`/api/cobrancas/\${paymentToEdit.id}\`, {
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
`;
if (!content.includes('handleEditSave')) {
  content = content.replace(handleDeleteEndReg, editFunction);
  changes++;
}

// 4. Inject Edit Modal
const modalInjectionPoint = '{showPrintCarneModal && (';
const editModal = `
{paymentToEdit && (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
    <form onSubmit={handleEditSave} className="bg-white rounded-3xl w-full max-w-md shadow-xl overflow-hidden flex flex-col relative">
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
${modalInjectionPoint}`;
if (!content.includes('Editar Cobrança')) {
  content = content.replace(modalInjectionPoint, editModal);
  changes++;
}

// 5. Inject Edit button to flat lists and nested carné lists
const TrashBtnFlat = `onClick={() => openDelete(payment)} className="p-2 text-slate-400 hover:text-red-600 transition-all" title="Excluir"><Trash2 size={18} /></button>`;
const newBtnsFlat = `onClick={() => { setPaymentToEdit(payment); setEditValue(payment.amount.toString()); setEditDate(payment.dueDate); }} className="p-2 text-slate-400 hover:text-indigo-600 transition-all font-bold" title="Editar"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>\n                 \t\t\t<button onClick={() => openDelete(payment)} className="p-2 text-slate-400 hover:text-red-600 transition-all" title="Excluir"><Trash2 size={18} /></button>`;
content = content.split(TrashBtnFlat).join(newBtnsFlat);

const TrashBtnNested = `onClick={() => openDelete(payment)} className="p-1.5 text-slate-400 hover:text-red-600 transition-all" title="Excluir Parcela"><Trash2 size={14} /></button>`;
const newBtnsNested = `onClick={() => { setPaymentToEdit(payment); setEditValue(payment.amount.toString()); setEditDate(payment.dueDate); }} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-all" title="Editar Parcela"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg></button>\n                 \t\t\t<button onClick={() => openDelete(payment)} className="p-1.5 text-slate-400 hover:text-red-600 transition-all" title="Excluir Parcela"><Trash2 size={14} /></button>`;
content = content.split(TrashBtnNested).join(newBtnsNested);


if (changes > 0) {
  fs.writeFileSync(file, content, 'utf8');
  console.log('Successfully injected Edit Modal and features.');
} else {
  console.log('Edit scripts failed or already exist.');
}
