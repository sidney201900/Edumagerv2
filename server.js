import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import multer from 'multer';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

// Supabase Setup
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_KEY;
  let supabase = null;
  
  if (supabaseUrl && supabaseKey) {
    try {
      supabase = createClient(supabaseUrl, supabaseKey);
    } catch (e) {
      console.warn('Failed to initialize Supabase client:', e);
    }
  } else {
    console.warn('Supabase credentials not found. Some API routes may fail.');
  }

const upload = multer({ storage: multer.memoryStorage() });

// Rota para upload e compressão da logo
app.post('/api/upload/logo', upload.single('logo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Nenhum arquivo enviado.' });
    }

    // Comprimir e converter para WebP
    const compressedBuffer = await sharp(req.file.buffer)
      .resize(500, 500, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 60 })
      .toBuffer();

    const fileName = `logo_${Date.now()}.webp`;
    const filePath = `logos/${fileName}`;

    // Upload para o Supabase Storage
    const { data, error } = await supabase.storage
      .from('edumanager-assets')
      .upload(filePath, compressedBuffer, {
        contentType: 'image/webp',
        upsert: true
      });

    if (error) {
      console.error('Erro no upload para o Supabase:', error);
      return res.status(500).json({ error: 'Erro ao salvar a imagem no storage.' });
    }

    // Obter URL pública
    const { data: publicUrlData } = supabase.storage
      .from('edumanager-assets')
      .getPublicUrl(filePath);

    return res.status(200).json({ url: publicUrlData.publicUrl });
  } catch (error) {
    console.error('Erro ao processar logo:', error);
    return res.status(500).json({ error: 'Erro interno ao processar a imagem.' });
  }
});

// Webhook Asaas
app.post('/api/webhook_asaas', async (req, res) => {
  const tokenRecebido = req.headers['asaas-access-token'];
  if (tokenRecebido !== process.env.ASAAS_WEBHOOK_TOKEN) {
    console.error('Tentativa de acesso negada: Token do webhook inválido!');
    addLog('Webhook', 'Auth Negada', 'Token inválido recebido');
    return res.status(401).json({ error: 'Não autorizado' });
  }

  try {
    const payload = req.body;
    const asaasPaymentId = payload.payment.id;
    let updateData = {};

    switch (payload.event) {
      case 'PAYMENT_RECEIVED':
      case 'PAYMENT_CONFIRMED':
        updateData = { 
          status: 'PAGO', 
          valor: payload.payment.value,
          data_pagamento: payload.payment.confirmedDate || payload.payment.paymentDate || new Date().toISOString().split('T')[0]
        };
        break;
      case 'PAYMENT_OVERDUE':
        updateData = { status: 'ATRASADO', valor: payload.payment.value };
        break;
      case 'PAYMENT_DELETED':
        updateData = { status: 'CANCELADO' };
        break;
      case 'PAYMENT_UPDATED':
        updateData = { valor: payload.payment.value, vencimento: payload.payment.dueDate, status: payload.payment.status === 'RECEIVED' ? 'PAGO' : undefined };
        // Remove undefined keys
        Object.keys(updateData).forEach(k => updateData[k] === undefined && delete updateData[k]);
        break;
      default:
        console.log(`Evento ignorado: ${payload.event}`);
        return res.status(200).json({ message: 'Evento ignorado' });
    }

    const { error } = await supabase
      .from('alunos_cobrancas')
      .update(updateData)
      .eq('asaas_payment_id', asaasPaymentId);

    if (error) {
      console.error(`Erro ao atualizar Supabase para o evento ${payload.event}:`, error);
      addLog('Webhook', `Erro ${payload.event}`, { asaasPaymentId, error: error.message });
      throw error;
    }
    
    addLog('Webhook', `Sucesso ${payload.event}`, { asaasPaymentId, updateData });
    console.log(`Sucesso: Pagamento ${asaasPaymentId} atualizado via Webhook (${payload.event})!`);
    return res.status(200).json({ message: 'Webhook processado com sucesso' });

  } catch (error) {
    console.error('Erro no Webhook:', error);
    addLog('Webhook', 'Erro Interno', error.message);
    return res.status(500).json({ error: 'Erro interno' });
  }
});

// Gerar Cobrança
app.post('/api/gerar_cobranca', async (req, res) => {
  try {
    const { 
      aluno_id, nome, cpf, email, valor, vencimento, multa, juros, desconto,
      telefone, cep, endereco, numero, bairro, descricao, parcelas
    } = req.body;

    // 1. Search or Create Asaas Customer
    let customerId = '';
    
    // Try to find customer by CPF first
    const searchRes = await fetch(`https://sandbox.asaas.com/api/v3/customers?cpfCnpj=${cpf}`, {
      method: 'GET',
      headers: {
        'access_token': process.env.ASAAS_API_KEY
      }
    });

    if (searchRes.ok) {
      const searchData = await searchRes.json();
      if (searchData.data && searchData.data.length > 0) {
        customerId = searchData.data[0].id;
      }
    }

    if (!customerId) {
      const customerRes = await fetch('https://sandbox.asaas.com/api/v3/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'access_token': process.env.ASAAS_API_KEY
        },
        body: JSON.stringify({
          name: nome,
          cpfCnpj: cpf,
          email: email,
          mobilePhone: telefone,
          postalCode: cep,
          address: endereco,
          addressNumber: numero,
          province: bairro
        })
      });

      if (!customerRes.ok) {
        const errorData = await customerRes.json();
        console.error('Asaas Customer Error:', errorData);
        // Extract specific error message from Asaas if available
        const asaasMsg = errorData.errors?.[0]?.description || 'Falha ao criar cliente no Asaas';
        throw new Error(asaasMsg);
      }

      const customerData = await customerRes.json();
      customerId = customerData.id;
    }

    // 2. Create Asaas Payment
    const asaasPayload = {
      customer: customerId,
      billingType: 'BOLETO',
      dueDate: vencimento,
      description: descricao ? `${descricao} - Microtec Informática Cursos` : 'Mensalidade - Microtec Informática Cursos'
    };

    const isInstallment = parcelas && parseInt(parcelas) > 1;

    if (isInstallment) {
      // Condição B: Parcelamento / Carnê (> 1 Parcela)
      asaasPayload.installmentCount = parseInt(parcelas);
      asaasPayload.installmentValue = parseFloat(valor);
    } else {
      // Condição A: Cobrança Avulsa (1 Parcela)
      asaasPayload.value = parseFloat(valor);
    }

    const fineValue = parseFloat(multa);
    const interestValue = parseFloat(juros);
    const discountValue = parseFloat(desconto);

    if (!isNaN(fineValue) && fineValue > 0) asaasPayload.fine = { value: fineValue, type: 'PERCENTAGE' };
    if (!isNaN(interestValue) && interestValue > 0) asaasPayload.interest = { value: interestValue, type: 'PERCENTAGE' };
    if (!isNaN(discountValue) && discountValue > 0) asaasPayload.discount = { value: discountValue, dueDateLimitDays: 0, type: 'FIXED' };

    console.log('Payload enviado para o Asaas:', asaasPayload);

    const paymentRes = await fetch('https://sandbox.asaas.com/api/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'access_token': process.env.ASAAS_API_KEY
      },
      body: JSON.stringify(asaasPayload)
    });

    if (!paymentRes.ok) {
      const errorData = await paymentRes.json();
      console.error('Asaas Payment Error:', errorData);
      const asaasMsg = errorData.errors?.[0]?.description || 'Falha ao criar cobrança no Asaas';
      throw new Error(asaasMsg);
    }

    const paymentData = await paymentRes.json();
    console.log('Resposta do Asaas (Criação):', paymentData);

    // 3. Save to Supabase
    let paymentsToSave = [];
    
    // CORREÇÃO: O ID oficial do parcelamento SEMPRE vem em paymentData.installment
    const installmentId = paymentData.installment;

    if (isInstallment && installmentId) {
      // Condição B: Salvar todas as parcelas geradas com o ID do pacote (installment)
      console.log('Detectado Parcelamento. ID do Carnê:', installmentId);
      
      // Buscar todas as cobranças geradas para este parcelamento no Asaas
      const installmentsRes = await fetch(`https://sandbox.asaas.com/api/v3/payments?installment=${installmentId}`, {
        method: 'GET',
        headers: {
          'access_token': process.env.ASAAS_API_KEY
        }
      });
      
      if (installmentsRes.ok) {
        const installmentsData = await installmentsRes.json();
        console.log(`Encontradas ${installmentsData.data.length} parcelas no Asaas.`);

        paymentsToSave = installmentsData.data.map(p => ({
          aluno_id: aluno_id,
          asaas_customer_id: customerId,
          asaas_payment_id: p.id,
          asaas_installment_id: installmentId,
          installment: installmentId, // Mantido para compatibilidade
          valor: p.value,
          vencimento: p.dueDate,
          link_boleto: p.bankSlipUrl
        }));
      } else {
        console.error('Falha ao buscar parcelas do installment:', installmentId);
        throw new Error('Falha ao buscar parcelas do Asaas');
      }
    } else {
       // Condição A: Salvar cobrança avulsa com installment nulo
       console.log('Detectada Cobrança Avulsa. ID:', paymentData.id);
       paymentsToSave = [{
          aluno_id: aluno_id,
          asaas_customer_id: customerId,
          asaas_payment_id: paymentData.id,
          installment: null, // Obrigatoriamente nulo
          valor: paymentData.value || valor,
          vencimento: paymentData.dueDate || vencimento,
          link_boleto: paymentData.bankSlipUrl
       }];
    }

    console.log('Enviando para o Supabase:', paymentsToSave);

    const { error: dbError } = await supabase
      .from('alunos_cobrancas')
      .insert(paymentsToSave);

    if (dbError) {
      console.error('Supabase Insert Error:', dbError);
      throw new Error('Falha ao salvar no banco de dados');
    }

    return res.status(200).json({ 
      success: true,
      installment: installmentId || null,
      payments: paymentsToSave,
      bankSlipUrl: paymentsToSave[0]?.link_boleto,
      paymentId: paymentsToSave[0]?.asaas_payment_id
    });

  } catch (error) {
    console.error('Function Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

const apiLogs = [];
function addLog(service, action, details) { 
  apiLogs.unshift({ date: new Date().toISOString(), service, action, details }); 
  if(apiLogs.length > 200) apiLogs.pop(); 
}

app.get('/api/logs', (req, res) => res.json(apiLogs));

const isUUID = (str) => typeof str === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);

// EXCLUSÃO EM MASSA (Asaas + EduManager)
// Regra: Apagar no Asaas PRIMEIRO. SÓ apagar do banco se o Asaas retornar sucesso.
app.post('/api/excluir_cobranca', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id || typeof id !== 'string') return res.status(400).json({ error: 'ID não fornecido' });

    // Monta query segura para o Postgres (só inclui id.eq se for UUID válido)
    let queryParts = [`installment.eq.${id}`, `asaas_installment_id.eq.${id}`, `asaas_payment_id.eq.${id}`];
    if (isUUID(id)) queryParts.push(`id.eq.${id}`);
    const query = queryParts.join(',');
    
    // Busca tudo relacionado a esse ID no banco
    const { data: parcelas, error: fetchErr } = await supabase.from('alunos_cobrancas').select('*').or(query);
    if (fetchErr) {
      addLog('Supabase', 'Busca Exclusão', fetchErr.message);
      return res.status(500).json({ error: 'Erro ao buscar dados no banco.' });
    }

    // Identifica se o alvo é um carnê (inst_) ou pagamento avulso (pay_)
    const isInstallmentPackage = id.startsWith('inst_') || id.startsWith('ins_');
    const isSinglePayment = id.startsWith('pay_');

    // ==== PASSO 1: APAGAR NO ASAAS PRIMEIRO ====
    if (isInstallmentPackage) {
      // Deletar o pacote inteiro de parcelamento no Asaas
      console.log(`[Exclusão] Deletando parcelamento ${id} no Asaas...`);
      const resp = await fetch(`https://sandbox.asaas.com/api/v3/installments/${id}`, { 
        method: 'DELETE', 
        headers: { 'access_token': process.env.ASAAS_API_KEY } 
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ errors: [{ description: 'Erro desconhecido do Asaas' }] }));
        const errorMsg = errBody.errors?.[0]?.description || 'Falha ao excluir parcelamento no Asaas.';
        addLog('Asaas', 'Exclusão Parcelamento FALHOU', { id, status: resp.status, error: errorMsg });
        console.error(`[Exclusão] Asaas rejeitou exclusão do parcelamento ${id}:`, errorMsg);
        return res.status(400).json({ error: errorMsg });
      }
      addLog('Asaas', 'Exclusão Parcelamento OK', { id });
    } else if (isSinglePayment) {
      // Deletar pagamento avulso no Asaas
      console.log(`[Exclusão] Deletando pagamento ${id} no Asaas...`);
      const resp = await fetch(`https://sandbox.asaas.com/api/v3/payments/${id}`, { 
        method: 'DELETE', 
        headers: { 'access_token': process.env.ASAAS_API_KEY } 
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ errors: [{ description: 'Erro desconhecido do Asaas' }] }));
        const errorMsg = errBody.errors?.[0]?.description || 'Falha ao excluir pagamento no Asaas.';
        addLog('Asaas', 'Exclusão Pagamento FALHOU', { id, status: resp.status, error: errorMsg });
        console.error(`[Exclusão] Asaas rejeitou exclusão do pagamento ${id}:`, errorMsg);
        return res.status(400).json({ error: errorMsg });
      }
      addLog('Asaas', 'Exclusão Pagamento OK', { id });
    } else {
      // ID não é do Asaas (pode ser UUID local). Tenta encontrar os IDs Asaas nos registros
      if (parcelas && parcelas.length > 0) {
        // Coleta IDs Asaas únicos das parcelas encontradas
        const instIds = new Set();
        const payIds = new Set();
        parcelas.forEach(p => {
          if (p.asaas_installment_id?.startsWith('inst_') || p.asaas_installment_id?.startsWith('ins_')) instIds.add(p.asaas_installment_id);
          if (p.asaas_payment_id?.startsWith('pay_')) payIds.add(p.asaas_payment_id);
        });

        // Tenta deletar installments primeiro
        for (const instId of instIds) {
          const resp = await fetch(`https://sandbox.asaas.com/api/v3/installments/${instId}`, { method: 'DELETE', headers: { 'access_token': process.env.ASAAS_API_KEY } });
          if (!resp.ok) {
            const errBody = await resp.json().catch(() => ({}));
            const errorMsg = errBody.errors?.[0]?.description || 'Falha ao excluir no Asaas.';
            addLog('Asaas', 'Exclusão FALHOU (por UUID)', { instId, error: errorMsg });
            return res.status(400).json({ error: errorMsg });
          }
          addLog('Asaas', 'Exclusão OK (por UUID)', { instId });
        }
        // Depois os avulsos (que não fazem parte de nenhum installment)
        for (const payId of payIds) {
          // Verifica se este pay_ já foi deletado como parte de um installment
          const belongsToInst = parcelas.find(p => p.asaas_payment_id === payId && (instIds.has(p.asaas_installment_id)));
          if (belongsToInst) continue; // Já foi deletado junto com o installment

          const resp = await fetch(`https://sandbox.asaas.com/api/v3/payments/${payId}`, { method: 'DELETE', headers: { 'access_token': process.env.ASAAS_API_KEY } });
          if (!resp.ok) {
            const errBody = await resp.json().catch(() => ({}));
            const errorMsg = errBody.errors?.[0]?.description || 'Falha ao excluir no Asaas.';
            addLog('Asaas', 'Exclusão Pay FALHOU (por UUID)', { payId, error: errorMsg });
            return res.status(400).json({ error: errorMsg });
          }
          addLog('Asaas', 'Exclusão Pay OK (por UUID)', { payId });
        }
      }
    }

    // ==== PASSO 2: SÓ APAGA DO BANCO SE ASAAS DEU OK ====
    if (parcelas && parcelas.length > 0) {
      const idsToDelete = parcelas.map(p => p.id);
      const { error: delErr } = await supabase.from('alunos_cobrancas').delete().in('id', idsToDelete);
      if (delErr) {
        addLog('Supabase', 'Exclusão DB', { error: delErr.message, ids: idsToDelete });
        return res.status(500).json({ error: 'Exclusão do Asaas OK, mas falhou ao excluir do banco local.' });
      }
      addLog('Supabase', 'Exclusão DB OK', { count: idsToDelete.length });
    }
    
    console.log(`[Exclusão] Sucesso completo para ID: ${id}`);
    return res.status(200).json({ message: 'Excluído com sucesso (Asaas e EduManager)' });
  } catch (error) { 
    addLog('Server', 'Exclusão Erro Interno', error.message);
    console.error('[Exclusão] Erro interno:', error);
    return res.status(500).json({ error: 'Erro interno ao processar exclusão.' }); 
  }
});

// IMPRIMIR CARNÊ (Prevenção contra crash)
app.get('/api/parcelamentos/:id/carne', async (req, res) => {
  try {
    const id = req.params.id;
    // Monta query segura — só inclui id.eq. se for UUID válido
    let queryParts = [`installment.eq.${id}`, `asaas_installment_id.eq.${id}`];
    if (isUUID(id)) queryParts.push(`id.eq.${id}`);
    const query = queryParts.join(',');

    const { data: parcelas, error: dbErr } = await supabase.from('alunos_cobrancas').select('*').or(query).order('vencimento', { ascending: true });
    if (dbErr) {
      addLog('Supabase', 'Busca Carnê', dbErr.message);
      return res.status(500).json({ error: 'Erro de banco.' });
    }

    let instId = (id.startsWith('inst_') || id.startsWith('ins_')) ? id : null;
    if (!instId && parcelas?.length > 0) {
      const p = parcelas.find(x => x.asaas_installment_id?.startsWith('inst_') || x.asaas_installment_id?.startsWith('ins_'));
      if (p) instId = p.asaas_installment_id;
    }

    if (instId) {
      const ar = await fetch(`https://sandbox.asaas.com/api/v3/installments/${instId}`, { headers: { 'access_token': process.env.ASAAS_API_KEY } });
      if (ar.ok) {
        const data = await ar.json();
        if (data.paymentBookUrl) return res.status(200).json({ status: 'success', type: 'pdf', url: data.paymentBookUrl });
      }
    }
    
    const boletos = parcelas ? parcelas.map((c, i) => ({ id: c.id, numero: i + 1, vencimento: c.vencimento, valor: c.valor, linkBoleto: c.link_boleto, status: c.status, asaasPaymentId: c.asaas_payment_id })) : [];
    return res.status(200).json({ status: 'success', type: 'fallback', boletos, message: 'PDF unificado não disponível. Acesse os boletos individuais.' });
  } catch (error) {
    addLog('Server', 'Carnê Erro', error.message);
    return res.status(500).json({ error: 'Erro interno.' });
  }
});

app.get('/api/cobrancas/:id/link', async (req, res) => {
  try {
    const p = await fetch(`https://sandbox.asaas.com/api/v3/payments/${req.params.id}`, { headers: { 'access_token': process.env.ASAAS_API_KEY } });
    if (!p.ok) return res.status(404).json({ error: 'Não encontrada.' });
    const d = await p.json();
    return res.status(200).json({ bankSlipUrl: d.bankSlipUrl || d.invoiceUrl, transactionReceiptUrl: d.transactionReceiptUrl });
  } catch (error) { return res.status(500).json({ error: 'Erro interno.' }); }
});

app.patch('/api/alunos/:id/rematricular', async (req, res) => res.json({ success: true }));

// INICIALIZAÇÃO HÍBRIDA (Resolve o Preview do AI Studio e o Portainer)
async function startServer() {
  const distPath = path.join(__dirname, 'dist');
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.use((req, res, next) => req.path.startsWith('/api') ? next() : res.sendFile(path.join(distPath, 'index.html')));
  } else {
    const vite = await import('vite').then(m => m.createServer({ server: { middlewareMode: true }, appType: 'spa' }));
    app.use(vite.middlewares);
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`🚀 Servidor na porta ${PORT}`));
}
startServer();
