/**
 * HELP DESK - GRUPO ASTROTUR
 * Sistema completo migrado para Google Apps Script
 * 
 * PLANILHAS NECESSÁRIAS:
 * - "Usuarios" (id, email, senha, nome, telefone, funcao, setor, num_anydesk, foto_perfil, role, created_at)
 * - "Tickets" (id, protocolo, titulo, descricao, prioridade, status, solicitante_id, agente_id, setor, anexos, created_at, updated_at, closed_at)
 * - "Interactions" (id, ticket_id, autor_id, mensagem, tipo, anexos, created_at)
 * - "Feedbacks" (id, ticket_id, avaliador_id, nota_satisfacao, eficacia_solucao, tempo_resposta, comentarios, created_at)
 * - "Invitations" (id, email, role, token, invited_by, used, expires_at, created_at)
 * - "Sessions" (token, user_id, expires_at)
 */

// ==================== CONFIGURAÇÕES ====================
const SPREADSHEET_ID = ''; // INSERIR ID DA PLANILHA
const DRIVE_FOLDER_ID = ''; // INSERIR ID DA PASTA DO DRIVE PARA ANEXOS
const IT_EMAIL = 'ti@astoturviagens.com';
const ADMIN_EMAIL = 'danilo@grupoastrotur.com.br';

// ==================== WEB APP ====================
function doGet(e) {
  const page = e.parameter.page || 'login';
  const token = e.parameter.token || '';
  
  const template = HtmlService.createTemplateFromFile('Index');
  template.page = page;
  template.token = token;
  template.userData = token ? getUserBySessionToken(token) : null;
  
  return template.evaluate()
    .setTitle('Help Desk - Grupo Astrotur')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ==================== UTILITÁRIOS ====================
function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    initializeSheet(sheet, name);
  }
  return sheet;
}

function initializeSheet(sheet, name) {
  const headers = {
    'Usuarios': ['id', 'email', 'senha', 'nome', 'telefone', 'funcao', 'setor', 'num_anydesk', 'foto_perfil', 'role', 'created_at'],
    'Tickets': ['id', 'protocolo', 'titulo', 'descricao', 'prioridade', 'status', 'solicitante_id', 'agente_id', 'setor', 'anexos', 'created_at', 'updated_at', 'closed_at'],
    'Interactions': ['id', 'ticket_id', 'autor_id', 'mensagem', 'tipo', 'anexos', 'created_at'],
    'Feedbacks': ['id', 'ticket_id', 'avaliador_id', 'nota_satisfacao', 'eficacia_solucao', 'tempo_resposta', 'comentarios', 'created_at'],
    'Invitations': ['id', 'email', 'role', 'token', 'invited_by', 'used', 'expires_at', 'created_at'],
    'Sessions': ['token', 'user_id', 'expires_at']
  };
  
  if (headers[name]) {
    sheet.getRange(1, 1, 1, headers[name].length).setValues([headers[name]]);
    sheet.getRange(1, 1, 1, headers[name].length).setFontWeight('bold');
  }
}

function generateId() {
  return Utilities.getUuid();
}

function generateProtocol() {
  const num = Math.floor(Math.random() * 999999).toString().padStart(6, '0');
  return 'TKT-' + num;
}

function generateToken() {
  return Utilities.getUuid() + '-' + Date.now();
}

function hashPassword(password) {
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, password);
  return hash.map(b => ('0' + (b & 0xFF).toString(16)).slice(-2)).join('');
}

function getRowAsObject(sheet, rowIndex) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(rowIndex, 1, 1, sheet.getLastColumn()).getValues()[0];
  const obj = {};
  headers.forEach((h, i) => obj[h] = values[i]);
  return obj;
}

function getAllData(sheetName) {
  const sheet = getSheet(sheetName);
  if (sheet.getLastRow() < 2) return [];
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const data = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  
  return data.map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function findRowByColumn(sheet, columnName, value) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const colIndex = headers.indexOf(columnName);
  if (colIndex === -1) return -1;
  
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][colIndex] === value) return i + 1;
  }
  return -1;
}

function updateRow(sheet, rowIndex, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.getRange(rowIndex, 1, 1, values.length).setValues([values]);
}

function insertRow(sheet, data) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.appendRow(values);
  return sheet.getLastRow();
}

// ==================== AUTENTICAÇÃO ====================
function login(email, password) {
  try {
    const sheet = getSheet('Usuarios');
    const users = getAllData('Usuarios');
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return { success: false, error: 'Usuário não encontrado' };
    }
    
    if (user.senha !== hashPassword(password)) {
      return { success: false, error: 'Senha incorreta' };
    }
    
    // Criar sessão
    const sessionToken = generateToken();
    const sessionsSheet = getSheet('Sessions');
    insertRow(sessionsSheet, {
      token: sessionToken,
      user_id: user.id,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    
    return {
      success: true,
      token: sessionToken,
      user: {
        id: user.id,
        email: user.email,
        nome: user.nome,
        role: user.role,
        telefone: user.telefone,
        setor: user.setor,
        funcao: user.funcao,
        num_anydesk: user.num_anydesk,
        foto_perfil: user.foto_perfil
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function logout(token) {
  try {
    const sheet = getSheet('Sessions');
    const rowIndex = findRowByColumn(sheet, 'token', token);
    if (rowIndex > 1) {
      sheet.deleteRow(rowIndex);
    }
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getUserBySessionToken(token) {
  try {
    const sessions = getAllData('Sessions');
    const session = sessions.find(s => s.token === token);
    
    if (!session) return null;
    if (new Date(session.expires_at) < new Date()) return null;
    
    const users = getAllData('Usuarios');
    const user = users.find(u => u.id === session.user_id);
    
    if (!user) return null;
    
    return {
      id: user.id,
      email: user.email,
      nome: user.nome,
      role: user.role,
      telefone: user.telefone,
      setor: user.setor,
      funcao: user.funcao,
      num_anydesk: user.num_anydesk,
      foto_perfil: user.foto_perfil
    };
  } catch (error) {
    return null;
  }
}

function validateSession(token) {
  const user = getUserBySessionToken(token);
  return { valid: !!user, user: user };
}

function registerWithInvitation(invitationToken, userData) {
  try {
    const invitations = getAllData('Invitations');
    const invitation = invitations.find(i => i.token === invitationToken && !i.used);
    
    if (!invitation) {
      return { success: false, error: 'Convite inválido ou já utilizado' };
    }
    
    if (new Date(invitation.expires_at) < new Date()) {
      return { success: false, error: 'Convite expirado' };
    }
    
    // Verificar se email já existe
    const users = getAllData('Usuarios');
    if (users.find(u => u.email.toLowerCase() === invitation.email.toLowerCase())) {
      return { success: false, error: 'Email já cadastrado' };
    }
    
    // Criar usuário
    const userId = generateId();
    const userSheet = getSheet('Usuarios');
    insertRow(userSheet, {
      id: userId,
      email: invitation.email,
      senha: hashPassword(userData.senha),
      nome: userData.nome,
      telefone: userData.telefone || '',
      funcao: userData.funcao || '',
      setor: userData.setor || '',
      num_anydesk: userData.num_anydesk || '',
      foto_perfil: '',
      role: invitation.role,
      created_at: new Date().toISOString()
    });
    
    // Marcar convite como usado
    const invSheet = getSheet('Invitations');
    const invRowIndex = findRowByColumn(invSheet, 'token', invitationToken);
    if (invRowIndex > 1) {
      invitation.used = true;
      updateRow(invSheet, invRowIndex, invitation);
    }
    
    return { success: true, message: 'Cadastro realizado com sucesso' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function resetPassword(email) {
  try {
    const users = getAllData('Usuarios');
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return { success: false, error: 'Email não encontrado' };
    }
    
    // Gerar nova senha temporária
    const tempPassword = Math.random().toString(36).slice(-8);
    
    // Atualizar senha
    const sheet = getSheet('Usuarios');
    const rowIndex = findRowByColumn(sheet, 'id', user.id);
    user.senha = hashPassword(tempPassword);
    updateRow(sheet, rowIndex, user);
    
    // Enviar email
    MailApp.sendEmail({
      to: email,
      subject: 'Help Desk Astrotur - Recuperação de Senha',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D32F2F;">Help Desk - Grupo Astrotur</h2>
          <p>Olá ${user.nome},</p>
          <p>Sua nova senha temporária é: <strong>${tempPassword}</strong></p>
          <p>Recomendamos que você altere sua senha após o login.</p>
        </div>
      `
    });
    
    return { success: true, message: 'Nova senha enviada para o email' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== TICKETS ====================
function createTicket(token, ticketData) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    const ticketId = generateId();
    const protocolo = generateProtocol();
    const now = new Date().toISOString();
    
    // Processar anexos se houver
    let anexosJson = JSON.stringify({ imagens: [], arquivos: [], audio: null });
    if (ticketData.anexos) {
      anexosJson = JSON.stringify(ticketData.anexos);
    }
    
    const sheet = getSheet('Tickets');
    insertRow(sheet, {
      id: ticketId,
      protocolo: protocolo,
      titulo: ticketData.titulo,
      descricao: ticketData.descricao,
      prioridade: ticketData.prioridade || 'media',
      status: 'aberto',
      solicitante_id: user.id,
      agente_id: '',
      setor: user.setor || '',
      anexos: anexosJson,
      created_at: now,
      updated_at: now,
      closed_at: ''
    });
    
    // Enviar email para TI
    sendNewTicketEmail(ticketId, protocolo, ticketData, user);
    
    return { success: true, ticketId: ticketId, protocolo: protocolo };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getTickets(token, filters) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    let tickets = getAllData('Tickets');
    const users = getAllData('Usuarios');
    
    // Filtrar por role
    if (user.role === 'solicitante') {
      tickets = tickets.filter(t => t.solicitante_id === user.id);
    }
    
    // Aplicar filtros
    if (filters && filters.status && filters.status !== 'todos') {
      tickets = tickets.filter(t => t.status === filters.status);
    }
    
    // Adicionar dados do solicitante
    tickets = tickets.map(t => {
      const solicitante = users.find(u => u.id === t.solicitante_id);
      return {
        ...t,
        anexos: typeof t.anexos === 'string' ? JSON.parse(t.anexos || '{}') : t.anexos,
        solicitante: solicitante ? {
          nome: solicitante.nome,
          email: solicitante.email,
          telefone: solicitante.telefone,
          setor: solicitante.setor,
          num_anydesk: solicitante.num_anydesk
        } : null
      };
    });
    
    // Ordenar por data de criação (mais recentes primeiro)
    tickets.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return { success: true, tickets: tickets };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getTicketById(token, ticketId) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    const tickets = getAllData('Tickets');
    const ticket = tickets.find(t => t.id === ticketId);
    
    if (!ticket) return { success: false, error: 'Ticket não encontrado' };
    
    // Verificar permissão
    if (user.role === 'solicitante' && ticket.solicitante_id !== user.id) {
      return { success: false, error: 'Sem permissão' };
    }
    
    const users = getAllData('Usuarios');
    const solicitante = users.find(u => u.id === ticket.solicitante_id);
    const agente = ticket.agente_id ? users.find(u => u.id === ticket.agente_id) : null;
    
    return {
      success: true,
      ticket: {
        ...ticket,
        anexos: typeof ticket.anexos === 'string' ? JSON.parse(ticket.anexos || '{}') : ticket.anexos,
        solicitante: solicitante ? {
          nome: solicitante.nome,
          email: solicitante.email,
          telefone: solicitante.telefone,
          setor: solicitante.setor,
          num_anydesk: solicitante.num_anydesk
        } : null,
        agente: agente ? { nome: agente.nome, email: agente.email } : null
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function updateTicket(token, ticketId, updates) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    if (user.role === 'solicitante') {
      return { success: false, error: 'Sem permissão' };
    }
    
    const sheet = getSheet('Tickets');
    const rowIndex = findRowByColumn(sheet, 'id', ticketId);
    
    if (rowIndex < 2) return { success: false, error: 'Ticket não encontrado' };
    
    const ticket = getRowAsObject(sheet, rowIndex);
    const oldStatus = ticket.status;
    
    // Atualizar campos
    Object.keys(updates).forEach(key => {
      if (key !== 'id') ticket[key] = updates[key];
    });
    ticket.updated_at = new Date().toISOString();
    
    if (updates.status === 'fechado' || updates.status === 'resolvido') {
      ticket.closed_at = new Date().toISOString();
    }
    
    // Se está assumindo o ticket
    if (!ticket.agente_id && user.role !== 'solicitante') {
      ticket.agente_id = user.id;
    }
    
    updateRow(sheet, rowIndex, ticket);
    
    // Registrar mudança de status como interação
    if (updates.status && updates.status !== oldStatus) {
      addInteraction(token, ticketId, {
        mensagem: `Status alterado de "${statusLabels[oldStatus]}" para "${statusLabels[updates.status]}"`,
        tipo: 'mudanca_status'
      });
      
      // Notificar solicitante
      sendStatusUpdateEmail(ticketId, oldStatus, updates.status);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

const statusLabels = {
  'aberto': 'Aberto',
  'em_andamento': 'Em Andamento',
  'aguardando_resposta': 'Aguardando Resposta',
  'resolvido': 'Resolvido',
  'fechado': 'Fechado'
};

// ==================== INTERAÇÕES (CHAT) ====================
function getInteractions(token, ticketId) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    // Verificar acesso ao ticket
    const ticketResult = getTicketById(token, ticketId);
    if (!ticketResult.success) return ticketResult;
    
    let interactions = getAllData('Interactions').filter(i => i.ticket_id === ticketId);
    const users = getAllData('Usuarios');
    
    interactions = interactions.map(i => {
      const autor = users.find(u => u.id === i.autor_id);
      return {
        ...i,
        anexos: typeof i.anexos === 'string' ? JSON.parse(i.anexos || '[]') : i.anexos,
        autor: autor ? { nome: autor.nome, email: autor.email, role: autor.role } : null
      };
    });
    
    interactions.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    
    return { success: true, interactions: interactions };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function addInteraction(token, ticketId, data) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    const interactionId = generateId();
    const sheet = getSheet('Interactions');
    
    insertRow(sheet, {
      id: interactionId,
      ticket_id: ticketId,
      autor_id: user.id,
      mensagem: data.mensagem,
      tipo: data.tipo || 'texto',
      anexos: JSON.stringify(data.anexos || []),
      created_at: new Date().toISOString()
    });
    
    // Atualizar ticket
    const ticketSheet = getSheet('Tickets');
    const rowIndex = findRowByColumn(ticketSheet, 'id', ticketId);
    if (rowIndex > 1) {
      const ticket = getRowAsObject(ticketSheet, rowIndex);
      ticket.updated_at = new Date().toISOString();
      updateRow(ticketSheet, rowIndex, ticket);
    }
    
    return { success: true, interactionId: interactionId };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== FEEDBACKS ====================
function submitFeedback(token, ticketId, feedbackData) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    // Verificar se ticket pertence ao usuário e está resolvido
    const ticketResult = getTicketById(token, ticketId);
    if (!ticketResult.success) return ticketResult;
    
    if (ticketResult.ticket.solicitante_id !== user.id) {
      return { success: false, error: 'Sem permissão' };
    }
    
    if (ticketResult.ticket.status !== 'resolvido') {
      return { success: false, error: 'Ticket não está resolvido' };
    }
    
    // Verificar se já existe feedback
    const feedbacks = getAllData('Feedbacks');
    if (feedbacks.find(f => f.ticket_id === ticketId)) {
      return { success: false, error: 'Feedback já enviado' };
    }
    
    const sheet = getSheet('Feedbacks');
    insertRow(sheet, {
      id: generateId(),
      ticket_id: ticketId,
      avaliador_id: user.id,
      nota_satisfacao: feedbackData.nota_satisfacao,
      eficacia_solucao: feedbackData.eficacia_solucao,
      tempo_resposta: feedbackData.tempo_resposta,
      comentarios: feedbackData.comentarios || '',
      created_at: new Date().toISOString()
    });
    
    // Fechar ticket após feedback
    const ticketSheet = getSheet('Tickets');
    const rowIndex = findRowByColumn(ticketSheet, 'id', ticketId);
    if (rowIndex > 1) {
      const ticket = getRowAsObject(ticketSheet, rowIndex);
      ticket.status = 'fechado';
      ticket.closed_at = new Date().toISOString();
      updateRow(ticketSheet, rowIndex, ticket);
    }
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function checkFeedback(token, ticketId) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    const feedbacks = getAllData('Feedbacks');
    const exists = feedbacks.find(f => f.ticket_id === ticketId);
    
    return { success: true, exists: !!exists };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== DASHBOARD / ESTATÍSTICAS ====================
function getDashboardStats(token) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    if (user.role === 'solicitante') {
      return { success: false, error: 'Sem permissão' };
    }
    
    const tickets = getAllData('Tickets');
    const feedbacks = getAllData('Feedbacks');
    
    // Contagens
    const stats = {
      total: tickets.length,
      abertos: tickets.filter(t => t.status === 'aberto').length,
      em_andamento: tickets.filter(t => t.status === 'em_andamento').length,
      aguardando: tickets.filter(t => t.status === 'aguardando_resposta').length,
      resolvidos: tickets.filter(t => t.status === 'resolvido').length,
      fechados: tickets.filter(t => t.status === 'fechado').length
    };
    
    // Média de satisfação
    const notasValidas = feedbacks.filter(f => f.nota_satisfacao).map(f => Number(f.nota_satisfacao));
    stats.media_satisfacao = notasValidas.length > 0 
      ? (notasValidas.reduce((a, b) => a + b, 0) / notasValidas.length).toFixed(1)
      : '-';
    
    return { success: true, stats: stats };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== ADMINISTRAÇÃO ====================
function getUsers(token) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    if (user.role !== 'admin') {
      return { success: false, error: 'Sem permissão' };
    }
    
    const users = getAllData('Usuarios').map(u => ({
      id: u.id,
      email: u.email,
      nome: u.nome,
      role: u.role,
      telefone: u.telefone,
      setor: u.setor,
      funcao: u.funcao,
      created_at: u.created_at
    }));
    
    return { success: true, users: users };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function updateUserRole(token, userId, newRole) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    if (user.role !== 'admin') {
      return { success: false, error: 'Sem permissão' };
    }
    
    const sheet = getSheet('Usuarios');
    const rowIndex = findRowByColumn(sheet, 'id', userId);
    
    if (rowIndex < 2) return { success: false, error: 'Usuário não encontrado' };
    
    const targetUser = getRowAsObject(sheet, rowIndex);
    targetUser.role = newRole;
    updateRow(sheet, rowIndex, targetUser);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function createInvitation(token, email, role) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    if (user.role !== 'admin') {
      return { success: false, error: 'Sem permissão' };
    }
    
    // Verificar se email já existe
    const users = getAllData('Usuarios');
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return { success: false, error: 'Email já cadastrado' };
    }
    
    // Verificar se já existe convite pendente
    const invitations = getAllData('Invitations');
    const pendingInvite = invitations.find(i => 
      i.email.toLowerCase() === email.toLowerCase() && 
      !i.used && 
      new Date(i.expires_at) > new Date()
    );
    
    if (pendingInvite) {
      return { success: false, error: 'Já existe um convite pendente para este email' };
    }
    
    const inviteToken = generateToken();
    const sheet = getSheet('Invitations');
    
    insertRow(sheet, {
      id: generateId(),
      email: email,
      role: role,
      token: inviteToken,
      invited_by: user.id,
      used: false,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString()
    });
    
    // Enviar email de convite
    const webAppUrl = ScriptApp.getService().getUrl();
    const inviteUrl = webAppUrl + '?page=register&token=' + inviteToken;
    
    MailApp.sendEmail({
      to: email,
      subject: 'Convite para o Help Desk - Grupo Astrotur',
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D32F2F;">Help Desk - Grupo Astrotur</h2>
          <p>Você foi convidado para acessar o sistema Help Desk.</p>
          <p>Clique no link abaixo para completar seu cadastro:</p>
          <p><a href="${inviteUrl}" style="background-color: #D32F2F; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Completar Cadastro</a></p>
          <p>Este link expira em 7 dias.</p>
          <p style="color: #666; font-size: 12px;">Se você não solicitou este convite, ignore este email.</p>
        </div>
      `
    });
    
    return { success: true, message: 'Convite enviado com sucesso' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getInvitations(token) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    if (user.role !== 'admin') {
      return { success: false, error: 'Sem permissão' };
    }
    
    const invitations = getAllData('Invitations').map(i => ({
      id: i.id,
      email: i.email,
      role: i.role,
      used: i.used,
      expires_at: i.expires_at,
      created_at: i.created_at
    }));
    
    return { success: true, invitations: invitations };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function deleteInvitation(token, invitationId) {
  try {
    const user = getUserBySessionToken(token);
    if (!user) return { success: false, error: 'Sessão inválida' };
    
    if (user.role !== 'admin') {
      return { success: false, error: 'Sem permissão' };
    }
    
    const sheet = getSheet('Invitations');
    const rowIndex = findRowByColumn(sheet, 'id', invitationId);
    
    if (rowIndex < 2) return { success: false, error: 'Convite não encontrado' };
    
    sheet.deleteRow(rowIndex);
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getInvitationByToken(inviteToken) {
  try {
    const invitations = getAllData('Invitations');
    const invitation = invitations.find(i => i.token === inviteToken && !i.used);
    
    if (!invitation) {
      return { success: false, error: 'Convite inválido ou já utilizado' };
    }
    
    if (new Date(invitation.expires_at) < new Date()) {
      return { success: false, error: 'Convite expirado' };
    }
    
    return { success: true, invitation: { email: invitation.email, role: invitation.role } };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== UPLOAD DE ARQUIVOS ====================
function uploadFile(base64Data, fileName, mimeType) {
  try {
    if (!DRIVE_FOLDER_ID) {
      return { success: false, error: 'Pasta do Drive não configurada' };
    }
    
    const folder = DriveApp.getFolderById(DRIVE_FOLDER_ID);
    const blob = Utilities.newBlob(Utilities.base64Decode(base64Data), mimeType, fileName);
    const file = folder.createFile(blob);
    
    // Tornar arquivo acessível
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    return {
      success: true,
      fileId: file.getId(),
      url: file.getUrl(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId()
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ==================== EMAILS ====================
function sendNewTicketEmail(ticketId, protocolo, ticketData, user) {
  try {
    const priorityColors = {
      'baixa': '#4CAF50',
      'media': '#FFC107',
      'alta': '#FF9800',
      'critica': '#F44336'
    };
    
    const priorityLabels = {
      'baixa': 'Baixa',
      'media': 'Média',
      'alta': 'Alta',
      'critica': 'Crítica'
    };
    
    const priority = ticketData.prioridade || 'media';
    
    MailApp.sendEmail({
      to: IT_EMAIL,
      subject: `[${priorityLabels[priority]}] Novo Ticket: ${protocolo} - ${ticketData.titulo}`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D32F2F;">Novo Ticket Aberto</h2>
          
          <div style="background-color: ${priorityColors[priority]}; color: white; padding: 10px; border-radius: 5px; margin-bottom: 20px;">
            <strong>Prioridade: ${priorityLabels[priority]}</strong>
          </div>
          
          <h3>Dados do Ticket</h3>
          <p><strong>Protocolo:</strong> ${protocolo}</p>
          <p><strong>Título:</strong> ${ticketData.titulo}</p>
          <p><strong>Descrição:</strong> ${ticketData.descricao}</p>
          
          <h3>Dados do Solicitante</h3>
          <p><strong>Nome:</strong> ${user.nome}</p>
          <p><strong>Email:</strong> ${user.email}</p>
          <p><strong>Telefone:</strong> ${user.telefone || 'Não informado'}</p>
          <p><strong>Setor:</strong> ${user.setor || 'Não informado'}</p>
          <p><strong>AnyDesk:</strong> ${user.num_anydesk || 'Não informado'}</p>
          
          <p style="margin-top: 20px;">
            <a href="${ScriptApp.getService().getUrl()}?page=ticket&id=${ticketId}" 
               style="background-color: #D32F2F; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Ver Ticket
            </a>
          </p>
        </div>
      `
    });
  } catch (error) {
    console.error('Erro ao enviar email:', error);
  }
}

function sendStatusUpdateEmail(ticketId, oldStatus, newStatus) {
  try {
    const tickets = getAllData('Tickets');
    const ticket = tickets.find(t => t.id === ticketId);
    if (!ticket) return;
    
    const users = getAllData('Usuarios');
    const solicitante = users.find(u => u.id === ticket.solicitante_id);
    if (!solicitante) return;
    
    MailApp.sendEmail({
      to: solicitante.email,
      subject: `Ticket ${ticket.protocolo} - Status Atualizado`,
      htmlBody: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #D32F2F;">Help Desk - Grupo Astrotur</h2>
          <p>Olá ${solicitante.nome},</p>
          <p>O status do seu ticket foi atualizado:</p>
          
          <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
            <p><strong>Protocolo:</strong> ${ticket.protocolo}</p>
            <p><strong>Título:</strong> ${ticket.titulo}</p>
            <p><strong>Status anterior:</strong> ${statusLabels[oldStatus]}</p>
            <p><strong>Novo status:</strong> ${statusLabels[newStatus]}</p>
          </div>
          
          <p>
            <a href="${ScriptApp.getService().getUrl()}?page=ticket&id=${ticketId}" 
               style="background-color: #D32F2F; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">
              Ver Ticket
            </a>
          </p>
        </div>
      `
    });
  } catch (error) {
    console.error('Erro ao enviar email:', error);
  }
}

// ==================== SETUP INICIAL ====================
function setupInitialAdmin() {
  // Executar apenas uma vez para criar o admin inicial
  const users = getAllData('Usuarios');
  
  if (users.length === 0) {
    const sheet = getSheet('Usuarios');
    insertRow(sheet, {
      id: generateId(),
      email: ADMIN_EMAIL,
      senha: hashPassword('admin123'), // MUDAR APÓS PRIMEIRO LOGIN
      nome: 'Administrador',
      telefone: '',
      funcao: 'Administrador',
      setor: 'TI',
      num_anydesk: '',
      foto_perfil: '',
      role: 'admin',
      created_at: new Date().toISOString()
    });
    
    return 'Admin criado com sucesso. Email: ' + ADMIN_EMAIL + ', Senha: admin123';
  }
  
  return 'Admin já existe';
}
