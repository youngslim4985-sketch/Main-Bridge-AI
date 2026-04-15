/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  Activity, 
  ShieldCheck, 
  Cpu, 
  Database, 
  ArrowRight, 
  Terminal, 
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Layers,
  Search,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { GoogleGenAI } from "@google/genai";
import { cn } from './lib/utils';

// --- Types ---

interface Transaction {
  id: string;
  amount: number;
  merchant: string;
  timestamp: string;
  status: 'PENDING' | 'VALIDATED' | 'AI_CHECK' | 'COMPLETED' | 'FAILED';
  riskScore?: number;
  isFraud?: boolean;
  explanation?: string;
}

interface LogEntry {
  id: string;
  timestamp: string;
  source: 'CLIENT' | 'ENTERPRISE' | 'AI_ENGINE' | 'SYSTEM';
  message: string;
  type: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS';
}

// --- Mock Data ---

const MOCK_METRICS = Array.from({ length: 20 }, (_, i) => ({
  time: `${i}:00`,
  requests: Math.floor(Math.random() * 100) + 50,
  latency: Math.floor(Math.random() * 200) + 100,
}));

// --- Components ---

const StatusBadge = ({ status }: { status: Transaction['status'] }) => {
  const colors = {
    PENDING: 'bg-gray-200 text-gray-700',
    VALIDATED: 'bg-blue-100 text-blue-700',
    AI_CHECK: 'bg-amber-100 text-amber-700',
    COMPLETED: 'bg-green-100 text-green-700',
    FAILED: 'bg-red-100 text-red-700',
  };
  return (
    <span className={cn("px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase", colors[status])}>
      {status}
    </span>
  );
};

export default function App() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [systemStatus, setSystemStatus] = useState<'ONLINE' | 'BUSY'>('ONLINE');
  const [activeTab, setActiveTab] = useState<'DASHBOARD' | 'ARCHITECTURE' | 'LOGS'>('DASHBOARD');
  
  const logEndRef = useRef<HTMLDivElement>(null);
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  // Scroll logs to bottom
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (source: LogEntry['source'], message: string, type: LogEntry['type'] = 'INFO') => {
    setLogs(prev => [...prev, {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toLocaleTimeString(),
      source,
      message,
      type
    }].slice(-50)); // Keep last 50 logs
  };

  const runInference = async (data: any) => {
    try {
      addLog('AI_ENGINE', 'Initiating ONNX-simulated inference via Gemini...', 'INFO');
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-lite-preview",
        contents: `Analyze this transaction for fraud risk. 
        Data: ${JSON.stringify(data)}
        
        Return a JSON object with:
        - riskScore: (0-1)
        - isFraud: boolean
        - explanation: short string
        
        Be concise.`,
        config: {
          responseMimeType: "application/json"
        }
      });

      const result = JSON.parse(response.text || '{}');
      addLog('AI_ENGINE', `Inference complete. Risk: ${result.riskScore}`, result.isFraud ? 'WARN' : 'SUCCESS');
      return result;
    } catch (error) {
      addLog('AI_ENGINE', 'Inference failed: ' + (error as Error).message, 'ERROR');
      return { riskScore: 0.5, isFraud: false, explanation: "Inference error fallback" };
    }
  };

  const handleCheckTransaction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const amount = Number(formData.get('amount'));
    const merchant = formData.get('merchant') as string;

    if (!amount || !merchant) return;

    setIsProcessing(true);
    setSystemStatus('BUSY');
    
    const newTx: Transaction = {
      id: 'TX-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      amount,
      merchant,
      timestamp: new Date().toLocaleTimeString(),
      status: 'PENDING'
    };

    setTransactions(prev => [newTx, ...prev]);
    addLog('CLIENT', `Request sent: $${amount} at ${merchant}`, 'INFO');

    try {
      // 1. Enterprise Layer (Backend)
      addLog('ENTERPRISE', 'Validating transaction...', 'INFO');
      const enterpriseRes = await fetch('/api/enterprise/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, merchant })
      });
      
      if (!enterpriseRes.ok) throw new Error('Enterprise validation failed');
      const enterpriseData = await enterpriseRes.json();
      
      setTransactions(prev => prev.map(t => t.id === newTx.id ? { ...t, status: 'VALIDATED' } : t));
      addLog('ENTERPRISE', `Validation passed. ID: ${enterpriseData.transactionId}`, 'SUCCESS');

      // 2. AI Layer (Gemini)
      setTransactions(prev => prev.map(t => t.id === newTx.id ? { ...t, status: 'AI_CHECK' } : t));
      const aiResult = await runInference(enterpriseData.enrichedData);

      setTransactions(prev => prev.map(t => t.id === newTx.id ? { 
        ...t, 
        status: 'COMPLETED',
        riskScore: aiResult.riskScore,
        isFraud: aiResult.isFraud,
        explanation: aiResult.explanation
      } : t));
      
      addLog('SYSTEM', `Transaction ${newTx.id} processed successfully.`, 'SUCCESS');
    } catch (error) {
      setTransactions(prev => prev.map(t => t.id === newTx.id ? { ...t, status: 'FAILED' } : t));
      addLog('SYSTEM', 'Processing error: ' + (error as Error).message, 'ERROR');
    } finally {
      setIsProcessing(false);
      setSystemStatus('ONLINE');
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--color-line)] bg-white p-4 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-[var(--color-ink)] p-2 rounded">
            <Layers className="text-[var(--color-accent)] w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tighter uppercase">MainBridge AI</h1>
            <p className="text-[10px] font-mono opacity-50">HYBRID ENTERPRISE INFERENCE PIPELINE v2.4</p>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className={cn("status-indicator", systemStatus === 'ONLINE' ? 'status-online' : 'status-processing')} />
            <span className="text-[10px] font-mono font-bold uppercase">{systemStatus}</span>
          </div>
          <nav className="flex gap-1">
            {['DASHBOARD', 'ARCHITECTURE', 'LOGS'].map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab as any)}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition-all",
                  activeTab === tab 
                    ? "bg-[var(--color-ink)] text-[var(--color-bg)]" 
                    : "hover:bg-gray-100"
                )}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
      </header>

      <main className="flex-1 grid grid-cols-12 gap-0">
        {/* Left Sidebar: Controls & Stats */}
        <aside className="col-span-3 border-r border-[var(--color-line)] bg-white/30 p-6 flex flex-col gap-8">
          <section>
            <h2 className="col-header mb-4">Transaction Entry</h2>
            <form onSubmit={handleCheckTransaction} className="flex flex-col gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase opacity-60">Amount (USD)</label>
                <input 
                  name="amount"
                  type="number" 
                  step="0.01"
                  placeholder="0.00"
                  required
                  className="w-full bg-white border border-[var(--color-line)] p-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold uppercase opacity-60">Merchant Entity</label>
                <input 
                  name="merchant"
                  type="text" 
                  placeholder="e.g. AMZN_GLOBAL"
                  required
                  className="w-full bg-white border border-[var(--color-line)] p-2 font-mono text-sm focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]"
                />
              </div>
              <button 
                disabled={isProcessing}
                className={cn(
                  "w-full py-3 font-bold uppercase text-xs tracking-widest transition-all flex items-center justify-center gap-2",
                  isProcessing 
                    ? "bg-gray-300 cursor-not-allowed" 
                    : "bg-[var(--color-ink)] text-white hover:bg-[var(--color-accent)]"
                )}
              >
                {isProcessing ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isProcessing ? "PROCESSING..." : "RUN INFERENCE"}
              </button>
            </form>
          </section>

          <section className="flex-1">
            <h2 className="col-header mb-4">Network Latency (ms)</h2>
            <div className="h-40 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={MOCK_METRICS}>
                  <defs>
                    <linearGradient id="colorLat" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-accent)" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="var(--color-accent)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ddd" />
                  <Area 
                    type="monotone" 
                    dataKey="latency" 
                    stroke="var(--color-accent)" 
                    fillOpacity={1} 
                    fill="url(#colorLat)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="enterprise-card p-3">
                <p className="text-[10px] opacity-50 uppercase">Avg Latency</p>
                <p className="text-xl font-mono font-bold">142ms</p>
              </div>
              <div className="enterprise-card p-3">
                <p className="text-[10px] opacity-50 uppercase">Throughput</p>
                <p className="text-xl font-mono font-bold">84/m</p>
              </div>
            </div>
          </section>
        </aside>

        {/* Main Content Area */}
        <div className="col-span-9 bg-[var(--color-bg)] overflow-hidden flex flex-col">
          <AnimatePresence mode="wait">
            {activeTab === 'DASHBOARD' && (
              <motion.div 
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-8 flex flex-col gap-8 h-full overflow-y-auto"
              >
                <section>
                  <div className="flex justify-between items-end mb-4">
                    <h2 className="col-header">Live Transaction Stream</h2>
                    <div className="flex gap-4 text-[10px] font-mono opacity-50 uppercase">
                      <span>Total: {transactions.length}</span>
                      <span>Fraud Detected: {transactions.filter(t => t.isFraud).length}</span>
                    </div>
                  </div>
                  
                  <div className="border border-[var(--color-line)] bg-white/80">
                    <div className="grid grid-cols-[40px_1.5fr_1fr_1fr] p-4 border-b border-[var(--color-line)] bg-gray-50">
                      <div className="col-header">#</div>
                      <div className="col-header">Merchant / ID</div>
                      <div className="col-header">Amount</div>
                      <div className="col-header">Status / Risk</div>
                    </div>
                    
                    <div className="max-h-[500px] overflow-y-auto">
                      {transactions.length === 0 ? (
                        <div className="p-12 text-center opacity-30 flex flex-col items-center gap-2">
                          <Search className="w-8 h-8" />
                          <p className="text-xs font-mono uppercase">No active transactions</p>
                        </div>
                      ) : (
                        transactions.map((tx, idx) => (
                          <motion.div 
                            key={tx.id} 
                            initial={{ backgroundColor: 'rgba(242, 125, 38, 0.1)' }}
                            animate={{ backgroundColor: 'transparent' }}
                            className="data-row"
                          >
                            <div className="data-value opacity-50">{transactions.length - idx}</div>
                            <div className="flex flex-col">
                              <span className="font-bold text-sm">{tx.merchant}</span>
                              <span className="data-value text-[10px] opacity-50">{tx.id}</span>
                            </div>
                            <div className="data-value font-bold">${tx.amount.toFixed(2)}</div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={tx.status} />
                              {tx.riskScore !== undefined && (
                                <span className={cn(
                                  "data-value text-xs font-bold",
                                  tx.isFraud ? "text-red-600" : "text-green-600"
                                )}>
                                  {(tx.riskScore * 100).toFixed(0)}%
                                </span>
                              )}
                            </div>
                          </motion.div>
                        ))
                      )}
                    </div>
                  </div>
                </section>

                <div className="grid grid-cols-2 gap-8">
                  <section className="enterprise-card">
                    <h2 className="col-header mb-4">System Health</h2>
                    <div className="space-y-4">
                      {[
                        { name: 'Enterprise Gateway (Java)', status: 'ONLINE', icon: Database },
                        { name: 'Inference Engine (ONNX)', status: 'ONLINE', icon: Cpu },
                        { name: 'Security Layer (OWASP)', status: 'ACTIVE', icon: ShieldCheck },
                      ].map((s) => (
                        <div key={s.name} className="flex justify-between items-center border-b border-gray-100 pb-2">
                          <div className="flex items-center gap-2">
                            <s.icon className="w-4 h-4 opacity-50" />
                            <span className="text-xs font-bold uppercase tracking-tight">{s.name}</span>
                          </div>
                          <span className="text-[10px] font-mono text-green-600 font-bold">{s.status}</span>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="enterprise-card">
                    <h2 className="col-header mb-4">AI Insights</h2>
                    {transactions.length > 0 && transactions[0].explanation ? (
                      <div className="space-y-2">
                        <p className="text-xs italic text-gray-600 leading-relaxed">
                          "{transactions[0].explanation}"
                        </p>
                        <div className="flex items-center gap-2 text-[10px] font-mono uppercase opacity-50">
                          <Activity className="w-3 h-3" />
                          <span>Model: RandomForest-v4.onnx</span>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs opacity-30 uppercase font-mono">Waiting for inference data...</p>
                    )}
                  </section>
                </div>
              </motion.div>
            )}

            {activeTab === 'ARCHITECTURE' && (
              <motion.div 
                key="arch"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-12 flex flex-col items-center justify-center h-full gap-12"
              >
                <div className="text-center max-w-2xl">
                  <h2 className="text-3xl font-bold uppercase tracking-tighter mb-4">Hybrid Inference Pipeline</h2>
                  <p className="text-sm opacity-60 leading-relaxed">
                    MainBridge AI bridges legacy enterprise systems with modern AI inference engines. 
                    Requests are validated by the Enterprise Layer before being dispatched to the 
                    AI Inference Engine for high-speed risk assessment.
                  </p>
                </div>

                <div className="flex items-center gap-8 relative w-full max-w-4xl justify-between">
                  {/* Client */}
                  <div className="flex flex-col items-center gap-4 z-10">
                    <div className="w-24 h-24 bg-white border-2 border-[var(--color-line)] flex items-center justify-center rounded-xl shadow-lg">
                      <Activity className="w-10 h-10" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-widest">Client App</span>
                  </div>

                  <ArrowRight className="w-8 h-8 opacity-20" />

                  {/* Enterprise Layer */}
                  <div className="flex flex-col items-center gap-4 z-10">
                    <div className="w-32 h-32 bg-white border-2 border-[var(--color-line)] flex flex-col items-center justify-center rounded-xl shadow-lg p-4 text-center">
                      <Database className="w-10 h-10 mb-2 text-blue-600" />
                      <span className="text-[10px] font-bold uppercase">Enterprise Layer</span>
                      <span className="text-[8px] font-mono opacity-50 mt-1">Spring Boot / Node</span>
                    </div>
                  </div>

                  <ArrowRight className="w-8 h-8 opacity-20" />

                  {/* AI Layer */}
                  <div className="flex flex-col items-center gap-4 z-10">
                    <div className="w-32 h-32 bg-white border-2 border-[var(--color-line)] flex flex-col items-center justify-center rounded-xl shadow-lg p-4 text-center">
                      <Cpu className="w-10 h-10 mb-2 text-[var(--color-accent)]" />
                      <span className="text-[10px] font-bold uppercase">AI Inference</span>
                      <span className="text-[8px] font-mono opacity-50 mt-1">FastAPI / ONNX</span>
                    </div>
                  </div>

                  {/* Connecting Lines (SVG) */}
                  <svg className="absolute top-1/2 left-0 w-full h-1 -translate-y-1/2 -z-0 opacity-10">
                    <line x1="0" y1="0" x2="100%" y2="0" stroke="currentColor" strokeWidth="4" strokeDasharray="8 8" />
                  </svg>
                </div>

                <div className="grid grid-cols-3 gap-8 w-full max-w-4xl">
                  <div className="p-4 bg-white/50 border border-dashed border-gray-400 rounded">
                    <h4 className="text-[10px] font-bold uppercase mb-2">1. Request Flow</h4>
                    <p className="text-[10px] leading-tight opacity-70">Client sends transaction data via REST API to the Enterprise Gateway.</p>
                  </div>
                  <div className="p-4 bg-white/50 border border-dashed border-gray-400 rounded">
                    <h4 className="text-[10px] font-bold uppercase mb-2">2. Validation</h4>
                    <p className="text-[10px] leading-tight opacity-70">Enterprise layer validates business logic and enriches data with historical context.</p>
                  </div>
                  <div className="p-4 bg-white/50 border border-dashed border-gray-400 rounded">
                    <h4 className="text-[10px] font-bold uppercase mb-2">3. Inference</h4>
                    <p className="text-[10px] leading-tight opacity-70">Enriched data is sent to the ONNX engine for real-time fraud prediction.</p>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'LOGS' && (
              <motion.div 
                key="logs"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="p-8 h-full flex flex-col"
              >
                <div className="flex justify-between items-center mb-4">
                  <h2 className="col-header">System Logs</h2>
                  <button 
                    onClick={() => setLogs([])}
                    className="text-[10px] font-bold uppercase opacity-50 hover:opacity-100"
                  >
                    Clear Buffer
                  </button>
                </div>
                <div className="flex-1 bg-[var(--color-ink)] text-green-500 font-mono text-[11px] p-6 overflow-y-auto rounded-lg shadow-inner border border-gray-800">
                  {logs.length === 0 ? (
                    <div className="opacity-30 italic">System initialized. Awaiting input...</div>
                  ) : (
                    logs.map((log) => (
                      <div key={log.id} className="mb-1 flex gap-3">
                        <span className="opacity-30">[{log.timestamp}]</span>
                        <span className={cn(
                          "font-bold w-20",
                          log.source === 'CLIENT' ? 'text-blue-400' :
                          log.source === 'ENTERPRISE' ? 'text-purple-400' :
                          log.source === 'AI_ENGINE' ? 'text-amber-400' : 'text-gray-400'
                        )}>
                          {log.source}:
                        </span>
                        <span className={cn(
                          log.type === 'ERROR' ? 'text-red-500' :
                          log.type === 'WARN' ? 'text-amber-500' :
                          log.type === 'SUCCESS' ? 'text-green-400' : 'text-green-500'
                        )}>
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                  <div ref={logEndRef} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--color-line)] bg-white p-2 px-6 flex justify-between items-center text-[9px] font-mono uppercase opacity-50">
        <div className="flex gap-4">
          <span>Node: US-EAST-5-A</span>
          <span>Buffer: 1024KB</span>
          <span>Encryption: AES-256</span>
        </div>
        <div className="flex gap-4">
          <span>© 2026 MainBridge AI Systems</span>
          <span className="flex items-center gap-1">
            <Terminal className="w-2 h-2" />
            CLI READY
          </span>
        </div>
      </footer>
    </div>
  );
}
