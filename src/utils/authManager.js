// Authentication manager for seamless failover
class AuthManager {
  constructor() {
    this.currentConfig = 'main';
    this.retryCount = 0;
    this.maxRetries = 3;
    this.authStateCallbacks = [];
    this.currentUser = null;
  }

  // Initialize with automatic failover detection
  async initialize() {
    try {
      // Check server health to determine which config to use
      const response = await fetch('/api/firebase-config');
      const data = await response.json();
      
      this.currentConfig = data.currentConfig;
      console.log(`🔐 Using ${this.currentConfig} Firebase configuration`);
      
      // Set up auth state listener
      this.setupAuthStateListener();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize auth manager:', error);
      return false;
    }
  }

  // Set up authentication state listener
  setupAuthStateListener() {
    if (window.firebase) {
      const auth = window.firebase.auth();
      auth.onAuthStateChanged(user => {
        this.currentUser = user;
        this.authStateCallbacks.forEach(callback => callback(user));
      });
    }
  }

  // Add auth state change listener
  onAuthStateChanged(callback) {
    this.authStateCallbacks.push(callback);
    
    // Call immediately if user is already available
    if (this.currentUser) {
      callback(this.currentUser);
    }
  }

  // Smart sign in with automatic failover
  async signIn(email, password) {
    try {
      console.log(`🔐 Attempting sign in with ${this.currentConfig} configuration...`);
      
      if (!window.firebase) {
        throw new Error('Firebase not loaded');
      }
      
      const auth = window.firebase.auth();
      const userCredential = await auth.signInWithEmailAndPassword(email, password);
      
      this.retryCount = 0;
      console.log('✅ Sign in successful');
      return userCredential;
      
    } catch (error) {
      console.error(`❌ Sign in failed with ${this.currentConfig}:`, error);
      
      // If main fails, try backup
      if (this.currentConfig === 'main' && this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log('🔄 Attempting failover to backup...');
        
        await this.switchToBackup();
        return this.signIn(email, password);
      }
      
      throw error;
    }
  }

  // Switch to backup configuration
  async switchToBackup() {
    try {
      console.log('🔄 Switching to backup configuration...');
      
      // Sign out from current auth
      if (window.firebase && window.firebase.auth().currentUser) {
        await window.firebase.auth().signOut();
      }
      
      this.currentConfig = 'backup';
      
      // Notify server about the switch
      await fetch('/api/config-switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: 'backup' })
      });
      
      console.log('✅ Switched to backup configuration');
      return true;
    } catch (error) {
      console.error('❌ Failed to switch to backup:', error);
      return false;
    }
  }

  // Get current user
  getCurrentUser() {
    return this.currentUser;
  }

  // Sign out
  async signOut() {
    try {
      if (window.firebase) {
        await window.firebase.auth().signOut();
      }
      this.currentUser = null;
      return true;
    } catch (error) {
      console.error('❌ Sign out failed:', error);
      return false;
    }
  }

  // Get current configuration
  getCurrentConfig() {
    return this.currentConfig;
  }
}

// Export singleton
const authManager = new AuthManager();
export default authManager;