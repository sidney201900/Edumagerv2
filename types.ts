export interface User {
  id: string;
  name: string; // Username
  displayName?: string; // Real name
  photoURL?: string; // Profile photo URL
  password: string; // In a real app, this should be hashed
  cpf: string;
  role?: 'admin' | 'user';
}

export interface Course {
  id: string;
  name: string;
  duration: string; // Ex: "12 meses"
  durationMonths: number; // Campo numérico para cálculos
  registrationFee: number;
  monthlyFee: number;
  description: string;
  finePercentage?: number;
  interestPercentage?: number;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  phone: string;
  birthDate: string; // Formato esperado: YYYY-MM-DD
  cpf: string;
  rg?: string; // Novo campo
  rgIssueDate?: string; // Novo campo: YYYY-MM-DD
  guardianName?: string;
  guardianPhone?: string;
  guardianCpf?: string;
  guardianBirthDate?: string; // Novo campo
  classId: string;
  status: 'active' | 'inactive' | 'cancelled';
  cancellationReason?: string;
  registrationDate: string;
  photo?: string; // Base64 image
  faceDescriptor?: number[]; // Array of numbers for face recognition
  // Address fields
  addressZip?: string;
  addressStreet?: string;
  addressNumber?: string;
  addressNeighborhood?: string;
  addressCity?: string;
  addressState?: string;
  discount?: number;
  hasGuardian?: boolean;
  contractTemplateId?: string; // Vínculo com o modelo de contrato
  enrollmentNumber?: string; // Número de matrícula (login do portal do aluno)
  portalPassword?: string; // Senha do portal do aluno (padrão: 6 primeiros dígitos do CPF)
}

export interface Class {
  id: string;
  name: string;
  courseId: string; // Linked to Course.id
  teacher: string;
  schedule: string;
  scheduleDay?: string; // NOVO: 0 (Domingo) a 6 (Sábado)
  maxStudents: number;
  startDate?: string;
  endDate?: string;
  defaultStartTime?: string;
  defaultEndTime?: string;
}

export interface Lesson {
  id: string;
  classId: string;
  date: string; // ISO Date YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  status: 'scheduled' | 'cancelled' | 'completed' | 'rescheduled';
  type: 'regular' | 'reposicao';
  cancelReason?: string;
  originalLessonId?: string; // Se type === 'reposicao'
}

export interface Notification {
  id: string;
  studentId: string;
  title: string;
  message: string;
  read: boolean;
  createdAt: string; // ISO string
}

export interface Payment {
  id: string;
  studentId: string;
  contractId?: string; // Vínculo com o contrato
  amount: number;
  discount?: number; // Valor do desconto aplicado
  discountType?: 'fixed' | 'percentage'; // Tipo do desconto
  lateFee?: number; // Multa por atraso
  interest?: number; // Juros por atraso
  dueDate: string;
  status: 'pending' | 'paid' | 'overdue';
  paidDate?: string;
  type: 'monthly' | 'registration' | 'other';
  installmentNumber?: number;
  totalInstallments?: number;
  description?: string;
  asaasPaymentId?: string;
  asaasPaymentUrl?: string;
  installmentId?: string;
}

export interface Contract {
  id: string;
  studentId: string;
  title: string;
  content: string;
  createdAt: string;
}

export interface SchoolProfile {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  cnpj: string;
  phone: string;
  email: string;
  type: 'matriz' | 'filial';
}

export interface ContractTemplate {
  id: string;
  name: string;
  content: string;
}

export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
}

export interface Certificate {
  id: string;
  studentId: string;
  description?: string; // Descrição ou título do certificado
  frontImage: string; // Base64
  backImage?: string; // Base64 (Opcional)
  issueDate: string;
  frontOverlays: TextOverlay[];
  backOverlays: TextOverlay[];
}

export interface Attendance {
  id: string;
  studentId: string;
  classId: string;
  date: string; // ISO String
  photo?: string; // Base64 (Optional for absences)
  verified: boolean;
  type?: 'presence' | 'absence';
  justification?: string;
}

export interface CertificateTemplate {
  id: string;
  name: string;
  frontImage: string;
  backImage?: string;
  frontOverlays: TextOverlay[];
  backOverlays: TextOverlay[];
}

export interface Subject {
  id: string;
  name: string;
}

export interface Period {
  id: string;
  name: string;
}

export interface Grade {
  id: string;
  studentId: string;
  subjectId: string;
  value: number;
  period: string; // e.g., "1º Bimestre", "Final"
}

export interface Handout {
  id: string;
  name: string;
  price: number;
  description?: string;
  finePercentage?: number;
  interestPercentage?: number;
}

export interface HandoutDelivery {
  id: string;
  studentId: string;
  handoutId: string;
  deliveryStatus: 'pending' | 'delivered';
  paymentStatus: 'pending' | 'paid';
  deliveryDate?: string;
  paymentDate?: string;
  asaasPaymentId?: string;
  asaasPaymentUrl?: string;
}

export interface EmployeeCategory {
  id: string;
  name: string;
}

export interface Employee {
  id: string;
  name: string;
  cpf: string;
  phone: string;
  email: string;
  admissionDate: string;
  categoryId: string;
}

export interface SchoolData {
  users: User[];
  courses: Course[];
  students: Student[];
  classes: Class[];
  payments: Payment[];
  contracts: Contract[];
  contractTemplates?: ContractTemplate[];
  certificates: Certificate[];
  certificateTemplates?: CertificateTemplate[];
  attendance: Attendance[];
  subjects: Subject[];
  periods: Period[];
  grades: Grade[];
  handouts?: Handout[];
  handoutDeliveries?: HandoutDelivery[];
  employees?: Employee[];
  employeeCategories?: EmployeeCategory[];
  lessons?: Lesson[];
  notifications?: Notification[];
  profiles: SchoolProfile[];
  profile: SchoolProfile;
  logo?: string;
  lastUpdated?: string;
  evolutionConfig?: {
    apiUrl: string;
    instanceName: string;
    apiKey: string;
  };
  messageTemplates?: {
    boletoGerado: string;
    pagamentoConfirmado: string;
    boletoVencido: string;
    cobrancaCancelada?: string;
    cobrancaAtualizada?: string;
    automationRules: {
      sendOnDueDate: boolean;
      sendDaysAfter: string;
      repeatEveryDays: string;
    };
  };
}

export enum View {
  Dashboard = 'dashboard',
  Courses = 'courses',
  Students = 'students',
  Classes = 'classes',
  Finance = 'finance',
  Contracts = 'contracts',
  Certificates = 'certificates',
  Attendance = 'attendance',
  AttendanceQuery = 'attendance_query',
  ReportCard = 'report_card',
  Handouts = 'handouts',
  Employees = 'employees',
  Settings = 'settings',
  Users = 'users',
  Messages = 'messages'
}