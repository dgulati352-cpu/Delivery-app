// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyAee5w7VvHwp2vQTQ-tmMXTZq9A56cZrx8",
  authDomain: "shop-e1ee5.firebaseapp.com",
  projectId: "shop-e1ee5",
  storageBucket: "shop-e1ee5.firebasestorage.app",
  messagingSenderId: "134385752009",
  appId: "1:134385752009:web:ba94a13ceb01062f0b3a18"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ===== APP STATE =====
let currentPartner = null;
let activeOrders = [];
let completedOrders = [];
let partnerListener = null;
let ordersListener = null;

// ===== DOM CONTENT LOADED =====
document.addEventListener('DOMContentLoaded', () => {
  checkSession();
});

// ===== SESSION MANAGEMENT =====
function checkSession() {
  const session = localStorage.getItem('qs_delivery_partner');
  if (session) {
    currentPartner = JSON.parse(session);
    // Fetch fresh status and start listener
    listenToPartnerDoc();
  } else {
    showScreen('auth-screen');
  }
}

function saveSession(partnerData) {
  localStorage.setItem('qs_delivery_partner', JSON.stringify(partnerData));
  currentPartner = partnerData;
}

// Listen to the specific delivery boy's document in real-time to detect approval status changes
function listenToPartnerDoc() {
  if (partnerListener) partnerListener(); // stop previous

  partnerListener = db.collection('delivery_partners')
    .where('email', '==', currentPartner.email)
    .onSnapshot(snap => {
      if (snap.empty) {
        toast('Account not found or deleted by admin', 'error');
        logout();
        return;
      }
      
      const doc = snap.docs[0];
      const data = { _id: doc.id, ...doc.data() };
      saveSession(data);
      
      if (data.status === 'approved') {
        showScreen('main-panel');
        updateProfileUI();
        startOrdersListener();
      } else if (data.status === 'rejected') {
        showScreen('auth-screen');
        toast('Your registration was rejected by the admin.', 'error');
        logout();
      } else {
        showScreen('pending-screen');
      }
    }, err => {
      console.error('Partner listener error:', err);
      toast('Error listening to partner status: ' + err.message, 'error');
    });
}

function checkCurrentStatus() {
  toast('Checking status...', 'success');
  if (currentPartner && currentPartner.email) {
    db.collection('delivery_partners')
      .where('email', '==', currentPartner.email)
      .get()
      .then(snap => {
        if (!snap.empty) {
          const doc = snap.docs[0];
          const data = { _id: doc.id, ...doc.data() };
          saveSession(data);
          
          if (data.status === 'approved') {
            showScreen('main-panel');
            updateProfileUI();
            startOrdersListener();
            toast('Approved! Welcome back.', 'success');
          } else if (data.status === 'rejected') {
            toast('Account has been rejected by admin.', 'error');
            logout();
          } else {
            toast('Still pending approval.', 'info');
          }
        } else {
          toast('Account not found.', 'error');
        }
      })
      .catch(e => {
        toast('Error: ' + e.message, 'error');
      });
  }
}

// ===== REAL-TIME ORDERS LISTENER =====
function startOrdersListener() {
  if (ordersListener) ordersListener(); // stop previous

  ordersListener = db.collection('orders')
    .where('deliveryBoyId', '==', currentPartner.email)
    .onSnapshot(snap => {
      const orders = snap.docs.map(doc => ({ _id: doc.id, ...doc.data() }));
      
      // Sort orders by timestamp/date descending
      orders.sort((a, b) => {
        const tA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : new Date(a.createdAt).getTime();
        const tB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : new Date(b.createdAt).getTime();
        return tB - tA;
      });

      // Filter active and history
      // Active = Processing, Out for Delivery, Pending
      activeOrders = orders.filter(o => o.status !== 'Delivered' && o.status !== 'Cancelled');
      completedOrders = orders.filter(o => o.status === 'Delivered' || o.status === 'Cancelled');

      // Update counters
      document.getElementById('stat-active-count').textContent = activeOrders.length;
      document.getElementById('stat-delivered-count').textContent = completedOrders.filter(o => o.status === 'Delivered').length;
      
      renderActiveOrders();
      renderHistoryOrders();
      updateProfileUI(); // update order counts in profile too
    }, err => {
      console.error('Orders listener error:', err);
      toast('Error syncing orders: ' + err.message, 'error');
    });
}

// ===== RENDER METHODS =====
function renderActiveOrders() {
  const container = document.getElementById('active-deliveries-list');
  if (!activeOrders.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-route"></i>
        <p>No active deliveries assigned to you.</p>
      </div>`;
    return;
  }

  container.innerHTML = activeOrders.map(o => {
    const statusMap = {
      'Pending': 'badge-processing',
      'Processing': 'badge-processing',
      'Out for Delivery': 'badge-out-delivery'
    };
    
    const statusClass = statusMap[o.status] || 'badge-processing';
    const cleanPhone = o.customerPhone ? o.customerPhone.replace(/\D/g, '') : '';
    const waPhone = cleanPhone.length === 10 ? '91' + cleanPhone : cleanPhone;
    const itemsJson = JSON.stringify(o.items || []).replace(/"/g, '&quot;');
    
    // Action button logic
    let actionBtnHtml = '';
    if (o.status === 'Pending' || o.status === 'Processing') {
      actionBtnHtml = `<button class="btn-action primary" onclick="updateOrderStatus('${o._id}', 'Out for Delivery')"><i class="fas fa-shipping-fast"></i> Start Delivery</button>`;
    } else if (o.status === 'Out for Delivery') {
      actionBtnHtml = `<button class="btn-action success" onclick="updateOrderStatus('${o._id}', 'Delivered')"><i class="fas fa-check-circle"></i> Complete Delivery</button>`;
    }

    return `
      <div class="order-card" id="card-${o._id}">
        <div class="order-header">
          <div class="order-id-group">
            <span class="order-num">Order #${o.id || o._id.slice(-6)}</span>
            <span class="order-time">${fmtDate(o.createdAt)}</span>
          </div>
          <span class="badge-status ${statusClass}">${o.status}</span>
        </div>
        
        <div class="customer-info-box">
          <div class="info-row">
            <i class="fas fa-user"></i>
            <div><strong>${o.customerName || '—'}</strong></div>
          </div>
          <div class="info-row">
            <i class="fas fa-phone"></i>
            <div>${o.customerPhone || '—'}</div>
          </div>
          <div class="info-row">
            <i class="fas fa-map-marker-alt"></i>
            <div>${o.address || '—'}</div>
          </div>
          
          <div class="contact-actions">
            <a href="tel:${o.customerPhone}" class="btn-contact"><i class="fas fa-phone-alt"></i> Call</a>
            <a href="https://wa.me/${waPhone}?text=${encodeURIComponent('Hi ' + o.customerName + ', I am your delivery partner for your QuickShop order #' + (o.id || o._id) + '. I am on my way to deliver your order.')}" target="_blank" class="btn-contact whatsapp"><i class="fab fa-whatsapp"></i> Chat</a>
            <a href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(o.address || '')}" target="_blank" class="btn-contact maps"><i class="fas fa-map-marked-alt"></i> Map</a>
          </div>
        </div>

        <div class="items-list-trigger" onclick="toggleItems('${o._id}')">
          <span>Items Details</span>
          <i class="fas fa-chevron-down" id="arrow-${o._id}"></i>
        </div>
        <div class="items-list-content hidden" id="items-${o._id}">
          ${(o.items || []).map(item => `
            <div class="order-item-row">
              <span class="order-item-name">${item.name}</span>
              <span class="order-item-qty">x${item.quantity}</span>
            </div>
          `).join('')}
        </div>

        <div class="order-pricing-box">
          <span class="payment-type">${o.paymentMethod || 'COD'}</span>
          <div>Total: <span class="order-total-val">₹${o.total || 0}</span></div>
        </div>

        <div class="order-actions">
          ${actionBtnHtml}
          <button class="btn-action danger-link" onclick="cancelAssignment('${o._id}')">Unassign Me</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderHistoryOrders() {
  const container = document.getElementById('completed-deliveries-list');
  document.getElementById('history-count').textContent = completedOrders.length + ' orders';
  
  if (!completedOrders.length) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fas fa-history"></i>
        <p>Your completed deliveries will show here.</p>
      </div>`;
    return;
  }

  container.innerHTML = completedOrders.map(o => {
    const isDelivered = o.status === 'Delivered';
    const statusClass = isDelivered ? 'badge-delivered' : 'badge-cancelled';
    
    return `
      <div class="order-card">
        <div class="order-header" style="margin-bottom: 0; border: none; padding-bottom: 0;">
          <div class="order-id-group">
            <span class="order-num" style="font-size:14px;">Order #${o.id || o._id.slice(-6)}</span>
            <span class="order-time">${fmtDate(o.createdAt)}</span>
          </div>
          <span class="badge-status ${statusClass}">${o.status}</span>
        </div>
        
        <div style="margin-top: 10px; font-size: 13px; color: var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
          <span>To: <b>${o.customerName || '—'}</b></span>
          <span style="font-weight: 700; color: ${isDelivered ? 'var(--success)' : 'var(--danger)'}">₹${o.total || 0}</span>
        </div>
      </div>
    `;
  }).join('');
}

function updateProfileUI() {
  if (!currentPartner) return;
  document.getElementById('profile-name').textContent = currentPartner.name || 'Delivery Partner';
  document.getElementById('profile-email-sub').textContent = currentPartner.email || 'partner@quickshop.com';
  document.getElementById('profile-phone').textContent = currentPartner.phone || '—';
  document.getElementById('profile-vehicle').textContent = currentPartner.vehicleNumber || '—';
  document.getElementById('profile-status').textContent = currentPartner.status || 'Pending';
  document.getElementById('profile-total-delivered').textContent = completedOrders.filter(o => o.status === 'Delivered').length + ' orders';
  
  // Set initials
  if (currentPartner.name) {
    const parts = currentPartner.name.split(' ');
    const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    document.getElementById('profile-initials').textContent = initials;
  }
}

// ===== ORDER ACTIONS =====
async function updateOrderStatus(orderId, newStatus) {
  try {
    await db.collection('orders').doc(orderId).update({
      status: newStatus,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    toast(`Order status updated to: ${newStatus}`, 'success');
  } catch (e) {
    console.error('Error updating order status:', e);
    toast('Failed to update status: ' + e.message, 'error');
  }
}

async function cancelAssignment(orderId) {
  if (!confirm('Are you sure you want to unassign yourself from this order? It will go back to the admin pool.')) return;
  try {
    await db.collection('orders').doc(orderId).update({
      deliveryBoyId: null,
      deliveryBoyName: null,
      deliveryBoyPhone: null,
      status: 'Processing' // push back to processing status so admin can re-assign
    });
    toast('Order unassigned successfully.', 'success');
  } catch (e) {
    console.error('Error cancelling assignment:', e);
    toast('Unassignment failed: ' + e.message, 'error');
  }
}

// ===== AUTH ACTIONS =====
async function partnerLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) {
    toast('Please enter both email and password.', 'error');
    return;
  }

  toast('Signing in...', 'success');

  try {
    const snap = await db.collection('delivery_partners')
      .where('email', '==', email)
      .where('password', '==', password)
      .get();

    if (snap.empty) {
      toast('Invalid credentials or partner does not exist.', 'error');
      return;
    }

    const doc = snap.docs[0];
    const data = { _id: doc.id, ...doc.data() };
    saveSession(data);
    
    // Check status
    if (data.status === 'approved') {
      showScreen('main-panel');
      updateProfileUI();
      startOrdersListener();
      toast('Signed in successfully!', 'success');
    } else if (data.status === 'rejected') {
      toast('Your registration has been rejected by the admin.', 'error');
      logout();
    } else {
      showScreen('pending-screen');
      listenToPartnerDoc();
      toast('Registration pending approval.', 'info');
    }
  } catch (e) {
    console.error('Login error:', e);
    toast('Sign in failed: ' + e.message, 'error');
  }
}

async function partnerRegister() {
  const name = document.getElementById('register-name').value.trim();
  const phone = document.getElementById('register-phone').value.trim();
  const email = document.getElementById('register-email').value.trim();
  const vehicle = document.getElementById('register-vehicle').value.trim();
  const password = document.getElementById('register-password').value;

  if (!name || !phone || !email || !vehicle || !password) {
    toast('Please fill all registration fields.', 'error');
    return;
  }

  if (password.length < 6) {
    toast('Password must be at least 6 characters.', 'error');
    return;
  }

  toast('Submitting registration...', 'success');

  try {
    // Check if email already registered
    const dupSnap = await db.collection('delivery_partners')
      .where('email', '==', email)
      .get();

    if (!dupSnap.empty) {
      toast('Email address is already registered.', 'error');
      return;
    }

    const newPartner = {
      name,
      phone,
      email,
      vehicleNumber: vehicle,
      password,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    const docRef = await db.collection('delivery_partners').add(newPartner);
    newPartner._id = docRef.id;
    saveSession(newPartner);
    
    showScreen('pending-screen');
    listenToPartnerDoc();
    toast('Registration submitted! Awaiting approval.', 'success');
  } catch (e) {
    console.error('Registration error:', e);
    toast('Registration failed: ' + e.message, 'error');
  }
}

function logout() {
  // Clear status checks
  if (partnerListener) {
    partnerListener();
    partnerListener = null;
  }
  if (ordersListener) {
    ordersListener();
    ordersListener = null;
  }
  
  localStorage.removeItem('qs_delivery_partner');
  currentPartner = null;
  
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
  document.getElementById('register-name').value = '';
  document.getElementById('register-phone').value = '';
  document.getElementById('register-email').value = '';
  document.getElementById('register-vehicle').value = '';
  document.getElementById('register-password').value = '';
  
  showScreen('auth-screen');
}

// ===== PASSWORD UPDATE =====
function openPasswordModal() {
  document.getElementById('old-pass').value = '';
  document.getElementById('new-pass').value = '';
  document.getElementById('confirm-new-pass').value = '';
  document.getElementById('password-modal').classList.remove('hidden');
}

function closePasswordModal() {
  document.getElementById('password-modal').classList.add('hidden');
}

async function changePasswordSubmit() {
  const oldPass = document.getElementById('old-pass').value;
  const newPass = document.getElementById('new-pass').value;
  const confirmNew = document.getElementById('confirm-new-pass').value;

  if (!oldPass || !newPass || !confirmNew) {
    toast('Please fill all password fields.', 'error');
    return;
  }

  if (currentPartner.password !== oldPass) {
    toast('Incorrect current password.', 'error');
    return;
  }

  if (newPass !== confirmNew) {
    toast('New passwords do not match.', 'error');
    return;
  }

  if (newPass.length < 6) {
    toast('Password must be at least 6 characters.', 'error');
    return;
  }

  try {
    await db.collection('delivery_partners').doc(currentPartner._id).update({
      password: newPass
    });
    
    currentPartner.password = newPass;
    saveSession(currentPartner);
    closePasswordModal();
    toast('Password changed successfully!', 'success');
  } catch (e) {
    toast('Failed to change password: ' + e.message, 'error');
  }
}

// ===== VIEW HELPERS =====
function showScreen(screenId) {
  const screens = ['auth-screen', 'pending-screen', 'main-panel'];
  screens.forEach(s => {
    const el = document.getElementById(s);
    if (el) {
      if (s === screenId) {
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    }
  });
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  } else {
    tabLogin.classList.remove('active');
    tabRegister.classList.add('active');
    formLogin.classList.add('hidden');
    formRegister.classList.remove('hidden');
  }
}

function switchTab(tabId) {
  const tabs = ['home', 'history', 'profile'];
  tabs.forEach(t => {
    const navBtn = document.getElementById(`nav-${t}`);
    const section = document.getElementById(`section-${t}`);
    
    if (t === tabId) {
      if (navBtn) navBtn.classList.add('active');
      if (section) section.classList.remove('hidden');
    } else {
      if (navBtn) navBtn.classList.remove('active');
      if (section) section.classList.add('hidden');
    }
  });
}

function toggleItems(orderId) {
  const itemsDiv = document.getElementById(`items-${orderId}`);
  const arrow = document.getElementById(`arrow-${orderId}`);
  
  if (itemsDiv.classList.contains('hidden')) {
    itemsDiv.classList.remove('hidden');
    arrow.style.transform = 'rotate(180deg)';
  } else {
    itemsDiv.classList.add('hidden');
    arrow.style.transform = 'rotate(0deg)';
  }
}

function fmtDate(ts) {
  if (!ts) return '—';
  let dateObj;
  if (ts.toDate) {
    dateObj = ts.toDate();
  } else {
    dateObj = new Date(ts);
  }
  return dateObj.toLocaleDateString('en-IN', { 
    day: 'numeric', 
    month: 'short', 
    hour: '2-digit', 
    minute: '2-digit' 
  });
}

function toast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toastEl = document.createElement('div');
  const icons = { 
    success: 'fa-check-circle', 
    error: 'fa-exclamation-circle', 
    info: 'fa-info-circle' 
  };
  
  toastEl.className = `toast ${type}`;
  toastEl.innerHTML = `<i class="fas ${icons[type] || icons.success}"></i><span>${msg}</span>`;
  container.appendChild(toastEl);
  
  setTimeout(() => {
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translateY(-20px)';
    toastEl.style.transition = 'all 0.3s';
    setTimeout(() => toastEl.remove(), 300);
  }, 3000);
}
