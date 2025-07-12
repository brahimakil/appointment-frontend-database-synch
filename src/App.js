import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import { 
  Database, 
  Activity, 
  CheckCircle, 
  XCircle, 
  Clock, 
  RefreshCw,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Users,
  Shield,
  Monitor,
  FileText,
  Settings,
  Eye,
  Terminal,
  Zap,
  Server,
  Cloud,
  Timer
} from 'lucide-react';
import './index.css';

// Updated to use your deployed backend URL
const BACKEND_URL = 'https://appointment-backend-database-synch.onrender.com';

// Updated socket connection for production
const socket = io(BACKEND_URL, {
  transports: ['websocket', 'polling'],
  timeout: 45000,
  forceNew: false,
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 2000,
  reconnectionDelayMax: 10000,
  maxReconnectionAttempts: 10,
  randomizationFactor: 0.5,
  upgrade: true,
  rememberUpgrade: true,
  autoConnect: true,
  pingTimeout: 120000,
  pingInterval: 30000
});

function App() {
  const [stats, setStats] = useState({
    totalSynced: 0,
    lastSync: null,
    errors: 0,
    collections: [],
    status: 'idle',
    duplicatesSkipped: 0,
    incrementalSyncs: 0,
    authSync: {
      totalUsers: 0,
      syncedUsers: 0,
      errors: 0,
      lastSync: null,
      customClaims: 0
    }
  });
  
  const [authStats, setAuthStats] = useState({
    totalUsers: 0,
    syncedUsers: 0,
    errors: 0,
    lastSync: null,
    customClaims: 0
  });
  
  const [healthStatus, setHealthStatus] = useState({
    mainDb: false,
    backupDb: false,
    mainAuth: false,
    backupAuth: false,
    timestamp: null
  });
  
  const [syncProgress, setSyncProgress] = useState({});
  const [logs, setLogs] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [autoSyncNextTime, setAutoSyncNextTime] = useState(null);

  useEffect(() => {
    // Set initial connection status
    setIsConnected(socket.connected);

    // Socket event listeners with better handling
    socket.on('connect', () => {
      console.log('✅ Socket connected:', socket.id);
      setIsConnected(true);
      addLog('🟢 Connected to sync server', 'success');
    });

    socket.on('disconnect', (reason) => {
      console.log('❌ Socket disconnected:', reason);
      setIsConnected(false);
      
      // Only log user-initiated disconnects, not automatic ones
      if (reason !== 'transport close' && reason !== 'ping timeout') {
        addLog('🔴 Disconnected from sync server', 'error');
      }
    });

    socket.on('connect_error', (error) => {
      console.error('❌ Socket connection error:', error);
      setIsConnected(false);
      addLog('❌ Connection error: ' + error.message, 'error');
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log('🔄 Socket reconnected after', attemptNumber, 'attempts');
      setIsConnected(true);
      addLog('🔄 Reconnected to sync server', 'success');
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log('🔄 Reconnection attempt:', attemptNumber);
    });

    socket.on('reconnect_error', (error) => {
      console.error('❌ Reconnection failed:', error);
    });

    socket.on('reconnect_failed', () => {
      console.error('❌ All reconnection attempts failed');
      addLog('❌ Connection lost permanently', 'error');
    });

    socket.on('autoSyncTriggered', (data) => {
      addLog(`🔄 Auto-sync triggered (${data.interval || '10 minute'} interval)`, 'info');
      // Calculate next auto-sync time (10 minutes from now)
      const nextTime = new Date(Date.now() + 10 * 60 * 1000);
      setAutoSyncNextTime(nextTime.getTime()); // Store as timestamp instead of string
    });

    socket.on('syncStats', (newStats) => {
      setStats(newStats);
      if (newStats.authSync) {
        setAuthStats(newStats.authSync);
      }
    });

    socket.on('healthCheck', (health) => {
      setHealthStatus(health);
    });

    socket.on('syncProgress', (progress) => {
      setSyncProgress(prev => ({
        ...prev,
        [progress.collection]: progress
      }));
    });

    socket.on('authSyncProgress', (progress) => {
      addLog(`🔐 Auth sync: ${progress.action} ${progress.userCount} users`, 'info');
    });

    socket.on('authSyncComplete', (data) => {
      addLog(`✅ Auth sync completed: ${data.syncedUsers} users, ${data.customClaims} claims`, 'success');
      setAuthStats(data);
    });

    socket.on('collectionSynced', (data) => {
      addLog(`✅ Synced ${data.documentCount} docs in ${data.collection}${data.incremental ? ' (incremental)' : ''}`, 'success');
    });

    socket.on('collectionRecovered', (data) => {
      addLog(`🔄 Recovered ${data.documentCount} docs in ${data.collection}`, 'info');
    });

    socket.on('schemaChange', (data) => {
      addLog(`🔧 Schema change in ${data.collection}: ${data.newKeys.join(', ')}`, 'warning');
    });

    socket.on('integrityReport', (report) => {
      addLog(`🔍 Integrity check: ${report.totalIssues} issues found`, 
        report.totalIssues === 0 ? 'success' : 'warning');
    });

    socket.on('authIntegrityReport', (report) => {
      addLog(`🔐 Auth integrity: ${report.missingInBackup} missing, ${report.extraInBackup} extra`, 
        report.missingInBackup === 0 && report.extraInBackup === 0 ? 'success' : 'warning');
    });

    // Initialize next sync time (calculate based on server schedule)
    if (!autoSyncNextTime) {
      // Calculate next 10-minute boundary
      const now = new Date();
      const nextSync = new Date(now);
      nextSync.setMinutes(Math.ceil(now.getMinutes() / 10) * 10, 0, 0);
      if (nextSync <= now) {
        nextSync.setMinutes(nextSync.getMinutes() + 10);
      }
      setAutoSyncNextTime(nextSync.getTime());
    }

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('connect_error');
      socket.off('reconnect');
      socket.off('reconnect_attempt');
      socket.off('reconnect_error');
      socket.off('reconnect_failed');
      socket.off('autoSyncTriggered');
      socket.off('syncStats');
      socket.off('healthCheck');
      socket.off('syncProgress');
      socket.off('authSyncProgress');
      socket.off('authSyncComplete');
      socket.off('collectionSynced');
      socket.off('collectionRecovered');
      socket.off('schemaChange');
      socket.off('integrityReport');
      socket.off('authIntegrityReport');
    };
  }, []);

  // Add a separate useEffect for the countdown timer
  useEffect(() => {
    const timer = setInterval(() => {
      if (autoSyncNextTime) {
        const now = Date.now();
        if (now >= autoSyncNextTime) {
          // Time has passed, calculate next 10-minute interval
          const nextSync = new Date(now + 10 * 60 * 1000);
          setAutoSyncNextTime(nextSync.getTime());
        }
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [autoSyncNextTime]);

  // Helper function to format the countdown
  const getTimeUntilNextSync = () => {
    if (!autoSyncNextTime) return 'Calculating...';
    
    const now = Date.now();
    const timeLeft = autoSyncNextTime - now;
    
    if (timeLeft <= 0) {
      return 'Any moment now...';
    }
    
    const minutes = Math.floor(timeLeft / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    } else {
      return `${seconds}s`;
    }
  };

  const getNextSyncTime = () => {
    if (!autoSyncNextTime) return 'Calculating...';
    return new Date(autoSyncNextTime).toLocaleTimeString();
  };

  const addLog = (message, type = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs(prev => [...prev.slice(-49), { message, type, timestamp, id: Date.now() }]);
  };

  // Updated API call function to use production backend
  const apiCall = async (endpoint, method = 'GET', showSuccess = true) => {
    try {
      const response = await fetch(`${BACKEND_URL}${endpoint}`, { 
        method,
        headers: { 'Content-Type': 'application/json' },
        mode: 'cors'
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const text = await response.text();
        throw new Error(`Expected JSON but got: ${text.substring(0, 100)}...`);
      }
      
      const result = await response.json();
      
      if (result.success !== false && showSuccess) {
        addLog(`✅ ${result.message || 'Operation completed'}`, 'success');
      } else if (result.success === false) {
        addLog(`❌ ${result.error || 'Operation failed'}`, 'error');
      }
      return result;
    } catch (error) {
      addLog(`❌ ${error.message}`, 'error');
      return { success: false, error: error.message };
    }
  };

  const manualSync = () => apiCall('/api/sync', 'POST');
  const fullSync = () => apiCall('/api/sync/full', 'POST');
  const authSync = () => apiCall('/api/sync/auth', 'POST');
  const manualRecovery = () => apiCall('/api/recover', 'POST');
  const integrityCheck = () => apiCall('/api/integrity-check', 'POST');
  const authIntegrityCheck = () => apiCall('/api/auth-integrity-check', 'POST');

  const getStatusIcon = (status) => {
    switch (status) {
      case 'syncing':
      case 'recovering':
        return <RefreshCw className="animate-spin" size={20} />;
      case 'completed':
        return <CheckCircle size={20} color="#22c55e" />;
      case 'error':
        return <XCircle size={20} color="#ef4444" />;
      case 'paused':
        return <Pause size={20} color="#f59e0b" />;
      default:
        return <Clock size={20} color="#6b7280" />;
    }
  };

  const getLogIcon = (type) => {
    switch (type) {
      case 'success':
        return <CheckCircle size={16} color="#22c55e" />;
      case 'error':
        return <XCircle size={16} color="#ef4444" />;
      case 'warning':
        return <AlertTriangle size={16} color="#f59e0b" />;
      default:
        return <Activity size={16} color="#6b7280" />;
    }
  };

  const DashboardTab = () => (
    <div className="dashboard-container">
      {/* Hero Section */}
      <div className="hero-section">
        <div className="hero-content">
          <h1 className="hero-title">
            <Cloud size={40} />
            Firebase Sync Control Center
          </h1>
          <p className="hero-subtitle">
            Professional database synchronization with real-time monitoring
          </p>
          <div className="hero-stats">
            <div className="hero-stat">
              <span className="hero-stat-number">{stats.totalSynced?.toLocaleString() || 0}</span>
              <span className="hero-stat-label">Documents Synced</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-number">{authStats.syncedUsers?.toLocaleString() || 0}</span>
              <span className="hero-stat-label">Users Synced</span>
            </div>
            <div className="hero-stat">
              <span className="hero-stat-number">{stats.collections?.length || 0}</span>
              <span className="hero-stat-label">Collections</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="main-grid">
        {/* Left Column - System Status */}
        <div className="left-column">
          {/* Connection Status */}
          <div className="status-card">
            <div className="status-header">
              <Server size={24} />
              <h3>System Status</h3>
            </div>
            <div className="status-grid">
              <div className={`status-item ${socket.connected ? 'online' : 'offline'}`}>
                <Activity size={20} />
                <span>Connection</span>
                <span className="status-badge">{socket.connected ? 'Online' : 'Offline'}</span>
              </div>
              <div className={`status-item ${stats.status === 'syncing' ? 'syncing' : stats.status === 'error' ? 'error' : 'idle'}`}>
                {getStatusIcon(stats.status)}
                <span>Sync Status</span>
                <span className="status-badge">{stats.status}</span>
              </div>
            </div>
          </div>

          {/* Auto-Sync Timer */}
          <div className="timer-card">
            <div className="timer-header">
              <Timer size={24} />
              <h3>Auto-Sync</h3>
            </div>
            <div className="timer-content">
              <div className="timer-display">
                <Zap size={32} className="timer-icon" />
                <div className="timer-info">
                  <span className="timer-interval">Every 10 minutes</span>
                  <span className="timer-next">Next: {getNextSyncTime()}</span>
                  <span className="timer-countdown">In: {getTimeUntilNextSync()}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Database Health */}
          <div className="health-card">
            <div className="health-header">
              <Database size={24} />
              <h3>Database Health</h3>
            </div>
            <div className="health-grid">
              <div className={`health-item ${healthStatus.mainDb ? 'healthy' : 'unhealthy'}`}>
                {healthStatus.mainDb ? <CheckCircle size={18} /> : <XCircle size={18} />}
                <span>Main DB</span>
              </div>
              <div className={`health-item ${healthStatus.backupDb ? 'healthy' : 'unhealthy'}`}>
                {healthStatus.backupDb ? <CheckCircle size={18} /> : <XCircle size={18} />}
                <span>Backup DB</span>
              </div>
              <div className={`health-item ${healthStatus.mainAuth ? 'healthy' : 'unhealthy'}`}>
                {healthStatus.mainAuth ? <CheckCircle size={18} /> : <XCircle size={18} />}
                <span>Main Auth</span>
              </div>
              <div className={`health-item ${healthStatus.backupAuth ? 'healthy' : 'unhealthy'}`}>
                {healthStatus.backupAuth ? <CheckCircle size={18} /> : <XCircle size={18} />}
                <span>Backup Auth</span>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="actions-card">
            <div className="actions-header">
              <Settings size={24} />
              <h3>Quick Actions</h3>
            </div>
            <div className="actions-grid">
              <button onClick={fullSync} className="action-button primary">
                <RefreshCw size={16} />
                Full Sync
              </button>
              <button onClick={authSync} className="action-button purple">
                <Shield size={16} />
                Auth Sync
              </button>
              <button onClick={manualRecovery} className="action-button success">
                <RotateCcw size={16} />
                Recovery
              </button>
              <button onClick={integrityCheck} className="action-button warning">
                <Eye size={16} />
                Integrity Check
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Real-time Logs */}
        <div className="right-column">
          <div className="logs-card">
            <div className="logs-header">
              <Terminal size={24} />
              <h3>Real-time Activity</h3>
              <span className="logs-count">{logs.length} events</span>
            </div>
            <div className="logs-container">
              {logs.length === 0 ? (
                <div className="logs-empty">
                  <Activity size={48} />
                  <p>Waiting for activity...</p>
                </div>
              ) : (
                logs.slice().reverse().map((log) => (
                  <div key={log.id} className={`log-item ${log.type}`}>
                    <div className="log-icon">
                      {getLogIcon(log.type)}
                    </div>
                    <div className="log-content">
                      <span className="log-message">{log.message}</span>
                      <span className="log-time">{log.timestamp}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Collections Overview */}
      <div className="collections-overview">
        <div className="collections-header">
          <FileText size={24} />
          <h3>Collections Overview</h3>
        </div>
        <div className="collections-grid">
          {stats.collections?.map((collection) => (
            <div key={collection} className="collection-card">
              <div className="collection-header">
                <div className="collection-name">{collection}</div>
                <div className="collection-status">
                  {syncProgress[collection] ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>{syncProgress[collection].action}</span>
                    </>
                  ) : (
                    <CheckCircle size={16} color="#22c55e" />
                  )}
                </div>
              </div>
              {syncProgress[collection] && (
                <div>
                  <div className="collection-progress-text">
                    {syncProgress[collection].documentCount} documents
                  </div>
                  {syncProgress[collection].total && (
                    <div className="progress-bar">
                      <div 
                        className="progress-fill"
                        style={{ 
                          width: `${(syncProgress[collection].documentCount / syncProgress[collection].total) * 100}%` 
                        }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const ControlsTab = () => (
    <div className="controls-container">
      <div className="controls-grid">
        <div className="control-section">
          <h3>Sync Operations</h3>
          <div className="control-buttons">
            <div className="control-item">
              <button onClick={manualSync} className="control-button">
                <Play size={20} />
                <span>Incremental Sync</span>
              </button>
              <p className="control-description">Syncs only NEW/CHANGED documents from main → backup</p>
            </div>
            
            <div className="control-item">
              <button onClick={fullSync} className="control-button">
                <RefreshCw size={20} />
                <span>Full Sync</span>
              </button>
              <p className="control-description">Syncs ALL documents from main → backup (overwrites existing)</p>
            </div>
            
            <div className="control-item">
              <button onClick={authSync} className="control-button purple">
                <Shield size={20} />
                <span>Auth Sync</span>
              </button>
              <p className="control-description">Syncs all USER ACCOUNTS from main → backup Firebase Auth</p>
            </div>
            
            <div className="control-item">
              <button onClick={manualRecovery} className="control-button success">
                <RotateCcw size={20} />
                <span>Recovery</span>
              </button>
              <p className="control-description">Syncs from backup → main (when main DB comes back online)</p>
            </div>
          </div>
        </div>

        <div className="control-section">
          <h3>Integrity Checks</h3>
          <div className="control-buttons">
            <div className="control-item">
              <button onClick={integrityCheck} className="control-button warning">
                <Eye size={20} />
                <span>Data Integrity</span>
              </button>
              <p className="control-description">Checks for missing/corrupted documents between databases</p>
            </div>
            
            <div className="control-item">
              <button onClick={authIntegrityCheck} className="control-button warning">
                <Shield size={20} />
                <span>Auth Integrity</span>
              </button>
              <p className="control-description">Verifies user accounts consistency between Firebase Auth systems</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="app">
      <header className="header">
        <div className="header-content">
          <div className="header-left">
            <div className="logo">
              <Cloud size={32} />
              <span>Firebase Sync </span>
            </div>
          </div>
          
          <nav className="nav">
            <button 
              className={`nav-button ${activeTab === 'dashboard' ? 'active' : ''}`}
              onClick={() => setActiveTab('dashboard')}
            >
              <Monitor size={20} />
              Dashboard
            </button>
            <button 
              className={`nav-button ${activeTab === 'controls' ? 'active' : ''}`}
              onClick={() => setActiveTab('controls')}
            >
              <Settings size={20} />
              Controls
            </button>
          </nav>
          
          <div className="header-right">
            <div className={`connection-indicator ${socket.connected ? 'connected' : 'disconnected'}`}>
              <div className="connection-dot"></div>
              <span>{socket.connected ? 'Connected' : 'Offline'}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="main">
        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'controls' && <ControlsTab />}
      </main>
    </div>
  );
}

export default App; 