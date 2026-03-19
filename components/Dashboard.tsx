import React, { useState, useMemo } from 'react';
import { SchoolData, Student, Payment, Class } from '../types';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
  AreaChart,
  Area,
  Legend,
  LineChart,
  Line
} from 'recharts';
import { 
  Users, 
  BookOpen, 
  Wallet, 
  Clock, 
  FileDown, 
  RefreshCw, 
  TrendingUp, 
  UserPlus, 
  CheckCircle2, 
  AlertCircle,
  Calendar,
  ChevronRight,
  Layout
} from 'lucide-react';
import { pdfService } from '../services/pdfService';

interface DashboardProps {
  data: SchoolData;
}

const Dashboard: React.FC<DashboardProps> = ({ data }) => {
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [dashboardView, setDashboardView] = useState<'standard' | 'detailed'>('standard');

  // Basic Stats
  const activeStudents = useMemo(() => data.students.filter(s => s.status === 'active').length, [data.students]);
  const totalClasses = useMemo(() => data.classes.length, [data.classes]);
  const pendingPayments = useMemo(() => data.payments.filter(p => p.status === 'pending').length, [data.payments]);
  const revenue = useMemo(() => data.payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + p.amount, 0), [data.payments]);

  // Advanced Stats
  const newStudentsThisMonth = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    return data.students.filter(s => new Date(s.registrationDate) >= startOfMonth).length;
  }, [data.students]);

  const attendanceRate = useMemo(() => {
    if (!data.attendance || data.attendance.length === 0) return 0;
    const presents = data.attendance.filter(a => a.type === 'presence').length;
    return Math.round((presents / data.attendance.length) * 100);
  }, [data.attendance]);

  const averagePaymentValue = useMemo(() => {
    if (data.payments.length === 0) return 0;
    const total = data.payments.reduce((sum, p) => sum + p.amount, 0);
    return Math.round(total / data.payments.length);
  }, [data.payments]);

  // Chart Data: Class Occupancy
  const classOccupancy = useMemo(() => data.classes.map(c => ({
    name: c.name,
    students: data.students.filter(s => s.classId === c.id).length,
    capacity: 20 // Assuming a default capacity
  })).sort((a, b) => b.students - a.students), [data.classes, data.students]);

  // Chart Data: Payment Status
  const paymentStatus = useMemo(() => [
    { name: 'Pago', value: data.payments.filter(p => p.status === 'paid').length, color: '#10b981' },
    { name: 'Pendente', value: data.payments.filter(p => p.status === 'pending').length, color: '#f59e0b' },
    { name: 'Atrasado', value: data.payments.filter(p => p.status === 'overdue').length, color: '#ef4444' },
  ], [data.payments]);

  // Chart Data: Revenue Over Time (Last 6 months)
  const revenueHistory = useMemo(() => {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const now = new Date();
    const history = [];
    
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthName = months[d.getMonth()];
      const monthPayments = data.payments.filter(p => {
        const pDate = new Date(p.paidDate || p.dueDate);
        return pDate.getMonth() === d.getMonth() && pDate.getFullYear() === d.getFullYear() && p.status === 'paid';
      });
      const monthRevenue = monthPayments.reduce((sum, p) => sum + p.amount, 0);
      history.push({ name: monthName, revenue: monthRevenue });
    }
    return history;
  }, [data.payments]);

  // Recent Activity
  const recentActivity = useMemo(() => {
    const activities = [
      ...data.students.slice(-3).map(s => ({ 
        type: 'student', 
        title: 'Novo Aluno', 
        desc: s.name, 
        date: s.registrationDate,
        icon: UserPlus,
        color: 'bg-blue-100 text-blue-600'
      })),
      ...data.payments.filter(p => p.status === 'paid').slice(-3).map(p => ({ 
        type: 'payment', 
        title: 'Pagamento Recebido', 
        desc: `R$ ${p.amount.toLocaleString()}`, 
        date: p.paidDate || p.dueDate,
        icon: CheckCircle2,
        color: 'bg-emerald-100 text-emerald-600'
      }))
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5);
    
    return activities;
  }, [data.students, data.payments]);

  const handleGenerateReport = async () => {
    setIsGeneratingPDF(true);
    try {
      await pdfService.generateFullSchoolReportPDF(data);
    } catch (error) {
      console.error('Error generating PDF:', error);
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const stats = [
    { label: 'Alunos Ativos', value: activeStudents, icon: Users, color: 'text-blue-600', bg: 'bg-blue-100', trend: '+12%' },
    { label: 'Turmas Ativas', value: totalClasses, icon: BookOpen, color: 'text-indigo-600', bg: 'bg-indigo-100', trend: '+2' },
    { label: 'Receita Total', value: `R$ ${revenue.toLocaleString()}`, icon: Wallet, color: 'text-emerald-600', bg: 'bg-emerald-100', trend: '+8.4%' },
    { label: 'Taxa de Presença', value: `${attendanceRate}%`, icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-100', trend: '+2.1%' },
  ];

  const secondaryStats = [
    { label: 'Novos Alunos (Mês)', value: newStudentsThisMonth, icon: UserPlus, color: 'text-sky-600' },
    { label: 'Pagamentos Pendentes', value: pendingPayments, icon: Clock, color: 'text-amber-600' },
    { label: 'Ticket Médio', value: `R$ ${averagePaymentValue}`, icon: Wallet, color: 'text-slate-600' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-10">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">Painel Executivo</h2>
          <p className="text-slate-500 font-medium">Visão geral do desempenho da instituição.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
            <button 
              onClick={() => setDashboardView('standard')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dashboardView === 'standard' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Padrão
            </button>
            <button 
              onClick={() => setDashboardView('detailed')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${dashboardView === 'detailed' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              Detalhado
            </button>
          </div>
          <button 
            onClick={handleGenerateReport}
            disabled={isGeneratingPDF}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed font-bold text-sm"
          >
            {isGeneratingPDF ? (
              <RefreshCw size={18} className="animate-spin" />
            ) : (
              <FileDown size={18} />
            )}
            {isGeneratingPDF ? 'Gerando...' : 'Exportar PDF'}
          </button>
        </div>
      </header>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="group bg-white p-6 rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-300">
            <div className="flex justify-between items-start mb-4">
              <div className={`${stat.bg} ${stat.color} p-3 rounded-xl group-hover:scale-110 transition-transform`}>
                <stat.icon size={24} />
              </div>
              <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                {stat.trend}
              </span>
            </div>
            <div>
              <p className="text-sm text-slate-500 font-bold uppercase tracking-wider mb-1">{stat.label}</p>
              <h3 className="text-3xl font-black text-slate-900">{stat.value}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Secondary Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {secondaryStats.map((stat, i) => (
          <div key={i} className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`${stat.color}`}>
                <stat.icon size={20} />
              </div>
              <p className="text-sm font-bold text-slate-600">{stat.label}</p>
            </div>
            <p className="text-lg font-black text-slate-900">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Revenue Area Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-lg font-black text-slate-900">Fluxo de Receita</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">Últimos 6 meses</p>
            </div>
            <div className="flex items-center gap-2 text-emerald-600 font-black text-sm">
              <TrendingUp size={16} />
              <span>+15.2% vs ano anterior</span>
            </div>
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueHistory}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis 
                  dataKey="name" 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}} 
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false} 
                  tick={{fill: '#64748b', fontSize: 12, fontWeight: 600}}
                  tickFormatter={(value) => `R$ ${value}`}
                />
                <Tooltip 
                  contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  formatter={(value: number) => [`R$ ${value.toLocaleString()}`, 'Receita']}
                />
                <Area 
                  type="monotone" 
                  dataKey="revenue" 
                  stroke="#10b981" 
                  strokeWidth={3}
                  fillOpacity={1} 
                  fill="url(#colorRevenue)" 
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Payment Status Pie Chart */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 mb-2">Status Financeiro</h3>
          <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter mb-8">Distribuição de pagamentos</p>
          <div className="h-64 relative">
            {data.payments.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={paymentStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={70}
                      outerRadius={90}
                      paddingAngle={8}
                      dataKey="value"
                      stroke="none"
                    >
                      {paymentStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-3xl font-black text-slate-900">{data.payments.length}</span>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</span>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 font-bold italic">Sem dados</div>
            )}
          </div>
          <div className="mt-6 space-y-3">
            {paymentStatus.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full" style={{backgroundColor: item.color}}></div>
                  <span className="text-sm font-bold text-slate-600">{item.name}</span>
                </div>
                <span className="text-sm font-black text-slate-900">{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Class Occupancy Bar Chart */}
        <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-lg font-black text-slate-900">Ocupação das Turmas</h3>
              <p className="text-xs text-slate-500 font-bold uppercase tracking-tighter">Alunos por turma</p>
            </div>
            <button className="text-indigo-600 text-xs font-black uppercase tracking-widest hover:underline">Ver todas</button>
          </div>
          <div className="h-80">
            {classOccupancy.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={classOccupancy} layout="vertical" margin={{left: 40}}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{fill: '#1e293b', fontSize: 11, fontWeight: 800}}
                    width={80}
                  />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                  />
                  <Bar dataKey="students" fill="#6366f1" radius={[0, 10, 10, 0]} barSize={20}>
                    {classOccupancy.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === 0 ? '#4f46e5' : '#818cf8'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 font-bold italic">Sem turmas</div>
            )}
          </div>
        </div>

        {/* Recent Activity Feed */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="text-lg font-black text-slate-900 mb-6">Atividade Recente</h3>
          <div className="space-y-6">
            {recentActivity.length > 0 ? (
              recentActivity.map((activity, i) => (
                <div key={i} className="flex gap-4 relative">
                  {i !== recentActivity.length - 1 && (
                    <div className="absolute left-5 top-10 bottom-0 w-0.5 bg-slate-100 -mb-6"></div>
                  )}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${activity.color}`}>
                    <activity.icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <p className="text-sm font-black text-slate-900 truncate">{activity.title}</p>
                      <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap ml-2">
                        {new Date(activity.date).toLocaleDateString('pt-BR', {day: '2-digit', month: 'short'})}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium truncate">{activity.desc}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-slate-400 font-bold italic">Nenhuma atividade recente</div>
            )}
          </div>
          <button className="w-full mt-8 py-3 rounded-xl border border-slate-200 text-slate-600 text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
            Ver Log Completo
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {/* Detailed View Expansion */}
      {dashboardView === 'detailed' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 mb-6">Distribuição por Gênero</h3>
            <div className="h-48 flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Masculino', value: data.students.filter(s => s.gender === 'M').length },
                      { name: 'Feminino', value: data.students.filter(s => s.gender === 'F').length },
                      { name: 'Outro', value: data.students.filter(s => s.gender === 'O').length },
                    ]}
                    cx="50%"
                    cy="50%"
                    outerRadius={60}
                    dataKey="value"
                    label
                  >
                    <Cell fill="#3b82f6" />
                    <Cell fill="#ec4899" />
                    <Cell fill="#94a3b8" />
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <h3 className="text-lg font-black text-slate-900 mb-6">Alunos por Status</h3>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={[
                  { name: 'Ativo', value: data.students.filter(s => s.status === 'active').length },
                  { name: 'Inativo', value: data.students.filter(s => s.status === 'inactive').length },
                  { name: 'Trancado', value: data.students.filter(s => s.status === 'suspended').length },
                ]}>
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 12, fontWeight: 700}} />
                  <Tooltip cursor={{fill: 'transparent'}} />
                  <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
