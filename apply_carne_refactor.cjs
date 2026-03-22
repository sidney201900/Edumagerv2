const fs = require('fs');

const frontendFile = 'components/Finance.tsx';
let content = fs.readFileSync(frontendFile, 'utf8');

const srvFile = 'server.js';
let srvContent = fs.readFileSync(srvFile, 'utf8');

// 1. Injetar a Rota Nova no server.js
if (!srvContent.includes('/api/imprimir-carne/:installmentId')) {
  const newRoute = `
// NOVO ENDPOINT: Imprimir Carnê pelo UUID do Parcelamento
app.get('/api/imprimir-carne/:installmentId', async (req, res) => {
  try {
    const { installmentId } = req.params;
    const { sort, order } = req.query;
    
    // Extrai o UUID puro, removendo "ins_" ou "inst_" se houver
    const cleanId = installmentId.replace(/^(ins_|inst_)/, '');
    
    let asaasUrl = \`\${process.env.ASAAS_API_URL}/v3/installments/\${cleanId}/paymentBook\`;
    const asaasParams = new URLSearchParams();
    if (sort) asaasParams.append('sort', sort);
    if (order) asaasParams.append('order', order);
    
    if (asaasParams.toString()) {
      asaasUrl += \`?\${asaasParams.toString()}\`;
    }

    const response = await fetch(asaasUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'access_token': process.env.ASAAS_API_KEY
      }
    });

    const result = await response.json();
    
    if (response.ok) {
      res.json(result);
    } else {
      res.status(response.status).json(result);
    }
  } catch (error) {
    console.error('Erro ao gerar carnê impresso:', error);
    res.status(500).json({ error: 'Erro interno ao comunicar com Asaas.' });
  }
});
`;

  const idx = srvContent.lastIndexOf('app.listen(');
  if (idx !== -1) {
    srvContent = srvContent.slice(0, idx) + newRoute + srvContent.slice(idx);
    fs.writeFileSync(srvFile, srvContent, 'utf8');
    console.log('Added print route to server.js');
  }
}

// 2. Modificar Finance.tsx
// a. Injetar os states necessários para o dropdown e o modal
if (!content.includes('showPrintDropdown')) {
  const statesToInject = `
  const [showPrintDropdown, setShowPrintDropdown] = useState(false);
  const [printSortTarget, setPrintSortTarget] = useState<'dueDate' | ''>('');
  const [showInstallmentSelectModal, setShowInstallmentSelectModal] = useState(false);
  const [availableInstallments, setAvailableInstallments] = useState<any[]>([]);
`;
  const idx = content.indexOf('const [isModalOpen, setIsModalOpen] = useState(false);');
  content = content.slice(0, idx) + statesToInject + content.slice(idx);
}

// b. Injetar a lógica (as novas funções)
if (!content.includes('const initPrintCarne')) {
  const logicToInject = `
  const initPrintCarne = (sort: 'dueDate' | '') => {
    setPrintSortTarget(sort);
    if (filterStudent === 'all') {
      setShowPrintCarneModal(true);
    } else {
      checkInstallmentsForStudent(filterStudent, sort);
    }
  };

  const checkInstallmentsForStudent = (studentId: string, sort: 'dueDate' | '') => {
    const studentPayments = data.payments.filter(p => p.studentId === studentId && (p.asaasInstallmentId || p.installment));
    const grouped = {} as Record<string, any>;
    studentPayments.forEach(p => {
      const iid = p.asaasInstallmentId || (typeof p.installment === 'object' ? p.installment.id : p.installment);
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
      executePrintCarne(uniqueInstallments[0].id, sort);
    } else {
      setAvailableInstallments(uniqueInstallments);
      setShowInstallmentSelectModal(true);
    }
  };

  const executePrintCarne = async (installmentId: string, sort: 'dueDate' | '') => {
    setIsFetchingCarne(true);
    try {
      let url = \`/api/imprimir-carne/\${installmentId}\`;
      if (sort) url += \`?sort=\${sort}&order=ASC\`;
      
      const response = await fetch(url);
      const result = await response.json();
      
      if (response.ok && result.paymentBookUrl) {
        window.open(result.paymentBookUrl, '_blank', 'noopener,noreferrer');
        showAlert('Sucesso', 'Carnê gerado com sucesso!', 'success');
      } else {
        showAlert('Erro', result.error || 'Não foi possível gerar a URL do carnê.', 'error');
      }
    } catch (error) {
      console.error(error);
      showAlert('Erro', 'Ocorreu um erro ao comunicar com Asaas.', 'error');
    } finally {
      setIsFetchingCarne(false);
      setShowInstallmentSelectModal(false);
    }
  };
`;
  const idx = content.indexOf('const handlePrintCarne');
  if (idx !== -1) {
    content = content.slice(0, idx) + logicToInject + '\n' + content.slice(idx);
  }
}

// c. Substituir o botão do topo por um dropdown
const topButtonMatch = content.match(/<button[^>]+onClick={\(\) => setShowPrintCarneModal\(true\)}[\s\S]*?<\/button>/);
if (topButtonMatch) {
  const DropdownHTML = `
          <div className="relative">
            <button 
              onClick={() => setShowPrintDropdown(!showPrintDropdown)}
              className="flex-1 sm:flex-none bg-white text-indigo-600 border border-indigo-200 px-6 py-3 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-50 transition-all shadow-sm font-bold active:scale-95"
            >
              <Printer size={20} /> Imprimir Carnê <ChevronDown size={14} />
            </button>
            {showPrintDropdown && (
              <div className="absolute top-full mt-2 w-64 bg-white border border-slate-200 shadow-xl rounded-xl z-50 py-2">
                <button onClick={() => { setShowPrintDropdown(false); initPrintCarne(''); }} className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 font-bold transition-colors">Por ordem de impressão</button>
                <button onClick={() => { setShowPrintDropdown(false); initPrintCarne('dueDate'); }} className="block w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-slate-700 font-bold transition-colors">Por ordem de vencimento</button>
              </div>
            )}
          </div>
`;
  content = content.replace(topButtonMatch[0], DropdownHTML);
}

// d. Corrigir as chamadas no StudentModal (Reaproveitamento)
// O showPrintCarneModal tem um botão que precisa chamar checkInstallmentsForStudent
const printModalSaveMatch = content.match(/onClick={\(\) => {\s+if\s*\(selectedStudentForCarne\)\s*{\s*handlePrintCarne\(selectedStudentForCarne\);\s*setShowPrintCarneModal\(false\);\s*setSelectedStudentForCarne\(''\);\s*}\s*else/);

if (printModalSaveMatch) {
  content = content.replace(printModalSaveMatch[0], `onClick={() => {
                      if (selectedStudentForCarne) {
                        checkInstallmentsForStudent(selectedStudentForCarne, printSortTarget);
                        setShowPrintCarneModal(false);
                        setSelectedStudentForCarne('');
                      } else`);
}

// e. Adicionar o modal de Seleção de Parcelamento caso houver >1
if (!content.includes('showInstallmentSelectModal &&')) {
  const InstallmentModal = `
      {showInstallmentSelectModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto animate-in fade-in">
          <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl my-auto relative overflow-hidden animate-slide-up">
            <div className="bg-indigo-600 h-1.5 w-full absolute top-0 left-0 z-10"></div>
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-indigo-50/30">
              <div>
                <h3 className="text-xl font-black text-slate-800 tracking-tight">Selecione o Parcelamento</h3>
                <p className="text-sm text-slate-500 mt-1">O aluno possui {availableInstallments.length} parcelamentos ativos.</p>
              </div>
              <button onClick={() => setShowInstallmentSelectModal(false)} className="p-2 bg-white text-slate-400 hover:text-red-500 rounded-lg shadow-sm transition-all hover:rotate-90"><X size={20} /></button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              {availableInstallments.map((inst, index) => (
                <div key={inst.id} className="border border-slate-200 rounded-xl p-4 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer bg-white group" onClick={() => executePrintCarne(inst.id, printSortTarget)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-2">
                        <Layers size={16} className="text-indigo-500" />
                        Opção {index + 1}: {inst.description}
                      </div>
                      <div className="text-xs text-slate-500 mt-1">{inst.count} parcelas vinculadas</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-slate-900">R$ {inst.total.toFixed(2)}</div>
                      <button className="text-[10px] uppercase font-bold text-indigo-600 mt-2 bg-indigo-50 px-2 py-1 rounded group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                        Imprimir
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
`;
  // Inject before the final closing div
  const idx = content.lastIndexOf('</div>\r\n    </div>\r\n  );\r\n};');
  if (idx !== -1) {
    content = content.slice(0, idx) + InstallmentModal + content.slice(idx);
  }
}

fs.writeFileSync(frontendFile, content, 'utf8');
console.log('Finance.tsx modified successfully.');
