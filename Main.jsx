import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom/client';

// 🔥 IMPORT FIREBASE PACKAGES
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, onSnapshot, query, orderBy, doc, setDoc } from 'firebase/firestore';

// ==========================================
// 🔑 CONFIG YOUR FIREBASE INSTANCE HERE
// ==========================================
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ==========================================
// 🔑 HARDCODE YOUR THE BLUE ALLIANCE KEY HERE
// ==========================================
const TBA_AUTH_KEY = import.meta.env.VITE_TBA_AUTH_KEY; 

// --- GENERIC CATEGORY SUB-DIVISIONS ---
const CATEGORIES = ['Mechanical', 'Electrical', 'Pneumatics', 'Controls & Code'];
const BATTERY_LIST = ['Battery #1 (Gold)', 'Battery #2 (Silver)', 'Battery #3 (Bronze)', 'Battery #4 (Black)'];

// STATE MACHINE DEFINITIONS FOR BATTERY CONFIGURATIONS
const BATTERY_STATES = {
  CHARGING: { label: '⚡ CHARGING', color: '#F59E0B', bg: '#78350F' },
  READY: { label: '✅ READY', color: '#22C55E', bg: '#064E3B' },
  IN_USE: { label: '🤖 IN USE', color: '#3B82F6', bg: '#1E3A8A' },
  DEPLETED: { label: '🪫 DEPLETED', color: '#EF4444', bg: '#7F1D1D' }
};

const App = () => {
  // --- APPLICATION STATE INTERFACES ---
  const [activeTab, setActiveTab] = useState('check'); 
  const [selectedSubCat, setSelectedSubCat] = useState('Mechanical');
  
  // Dynamic Environment & Mode Statuses
  const [isPracticeMode, setIsPracticeMode] = useState(true);
  const [currentEventName, setCurrentEventName] = useState('Checking Blue Alliance API...');
  const [currentEventKey, setCurrentEventKey] = useState('');
  
  // Notification Permission Monitoring
  const [notificationPermission, setNotificationPermission] = useState(
    typeof Notification !== 'undefined' ? Notification.permission : 'default'
  );

  // Prevention triggers to make sure alerts fire exactly once per target match
  const [alertedQueuing, setAlertedQueuing] = useState(false);
  const [alertedTenMin, setAlertedTenMin] = useState(false);

  // Isolated Categorized Checklists
  const [compChecklist, setCompChecklist] = useState([
    { id: 'cm1', task: 'Inspect chassis and frame structural bolts', cat: 'Mechanical', tool: 'Wrenches / Allens', checked: false },
    { id: 'cm2', task: 'Check all drive chains, belts, and pulley tension', cat: 'Mechanical', tool: 'Hand test', checked: false },
    { id: 'cm3', task: 'Verify all wheels rotate smoothly without binding', cat: 'Mechanical', tool: 'Manual spin', checked: false },
    { id: 'ce1', task: 'Verify main battery quick-connect is locked tight', cat: 'Electrical', tool: 'Visual / Tug', checked: false },
    { id: 'ce2', task: 'Inspect major power wires for exposed copper', cat: 'Electrical', tool: 'Flashlight', checked: false },
    { id: 'cp1', task: 'Pressurize system and check for audible air leaks', cat: 'Pneumatics', tool: 'Listening test', checked: false },
    { id: 'cc1', task: 'Confirm wireless radio links to driver station laptop', cat: 'Controls & Code', tool: 'Ping test', checked: false },
    { id: 'cc2', task: 'Verify correct Autonomous Routine is selected', cat: 'Controls & Code', tool: 'Dashboard', checked: false }
  ]);

  const [practiceChecklist, setPracticeChecklist] = useState([
    { id: 'pm1', task: 'Confirm structural practice bumpers are secure', cat: 'Mechanical', tool: 'Hand test', checked: false },
    { id: 'pm2', task: 'Wipe down frame and grease gear assemblies if dry', cat: 'Mechanical', tool: 'Grease Gun', checked: false },
    { id: 'pe1', task: 'Check battery lead integrity at the charging station', cat: 'Electrical', tool: 'Visual', checked: false },
    { id: 'pe2', task: 'Inspect tether cable and radio bypass configurations', cat: 'Electrical', tool: 'Physical check', checked: false },
    { id: 'pp1', task: 'Drain compressor moisture manual release valve', cat: 'Pneumatics', tool: 'Manual turn', checked: false },
    { id: 'pc1', task: 'Deploy development code updates and test user inputs', cat: 'Controls & Code', tool: 'VSCode / Joystick', checked: false }
  ]);

  // Dynamic Schedule States
  const [schedule, setSchedule] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [apiError, setApiError] = useState('');

  // Separated Battery Metrics Configurations
  const [selectedBattery, setSelectedBattery] = useState(BATTERY_LIST[0]);
  const [batteryData, setBatteryData] = useState({ preVolts: '', preCharge: '', preResist: '', postVolts: '', postCharge: '', postResist: '' });

  // Real-time Cloud Data Trackers
  const [compHistory, setCompHistory] = useState([]);
  const [practiceHistory, setPracticeHistory] = useState([]);
  const [batteryStates, setBatteryStates] = useState({});

  // Countdown timer clock state for live match events
  const [secondsToMatch, setSecondsToMatch] = useState(0);

  // --- AUTOMATED CALCULATION LOGIC LAYER ---
  const currentChecklist = isPracticeMode ? practiceChecklist : compChecklist;
  const activeMatchObj = schedule.find(m => m.status === 'upcoming') || { matchNum: 'N/A', label: 'Practice Session' };
  const currentSessionLabel = isPracticeMode ? 'Practice Session' : `Match #${activeMatchObj.matchNum}`;

  const theme = { 
    green: '#22C55E', bg: '#0F172A', card: '#1E293B', text: '#F8FAFC', muted: '#94A3B8', border: '#334155', red: '#EF4444', amber: '#F59E0B'
  };

  const styles = {
    container: { backgroundColor: theme.bg, minHeight: '100vh', padding: '16px', color: theme.text, fontFamily: 'sans-serif' },
    card: { backgroundColor: theme.card, borderRadius: '16px', padding: '20px', marginBottom: '16px', border: `1px solid ${theme.border}` },
    input: { width: '100%', padding: '12px', borderRadius: '10px', border: `1px solid ${theme.border}`, backgroundColor: '#0F172A', color: 'white', fontSize: '16px', outline: 'none', boxSizing: 'border-box' },
    pickerBtn: (active) => ({
      padding: '10px', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', fontSize: '12px', flex: 1,
      backgroundColor: active ? theme.green : '#0F172A', color: active ? '#052e16' : 'white', border: active ? `1px solid ${theme.green}` : `1px solid ${theme.border}`,
      whiteSpace: 'nowrap', textAlign: 'center'
    }),
    submitBtn: { width: '100%', padding: '18px', borderRadius: '12px', border: 'none', backgroundColor: theme.green, color: '#052e16', fontWeight: '900', fontSize: '16px', cursor: 'pointer', marginTop: '10px' }
  };

  // 🔄 FIREBASE EFFECT: Real-time Cloud Sync Listeners
  useEffect(() => {
    // Sync Competition History
    const qComp = query(collection(db, "compHistory"), orderBy("createdAt", "desc"));
    const unsubscribeComp = onSnapshot(qComp, (snapshot) => {
      setCompHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Sync Practice History
    const qPractice = query(collection(db, "practiceHistory"), orderBy("createdAt", "desc"));
    const unsubscribePractice = onSnapshot(qPractice, (snapshot) => {
      setPracticeHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Sync Battery State Machine Real-time Collections
    const unsubscribeBatteries = onSnapshot(collection(db, "batteryStates"), (snapshot) => {
      const liveStates = {};
      snapshot.docs.forEach(doc => {
        liveStates[doc.id] = doc.data().status;
      });
      // Fallback injection if brand new database setup lacks records
      BATTERY_LIST.forEach(b => {
        if (!liveStates[b]) liveStates[b] = 'READY';
      });
      setBatteryStates(liveStates);
    });

    return () => {
      unsubscribeComp();
      unsubscribePractice();
      unsubscribeBatteries();
    };
  }, []);

  // Reset alert trackers whenever a new upcoming target match switches up
  useEffect(() => {
    setAlertedQueuing(false);
    setAlertedTenMin(false);
  }, [activeMatchObj.matchNum]);

  // Dispatches state machine updates across the cloud collection
  const transitionBatteryState = async (batteryName, targetStateKey) => {
    try {
      await setDoc(doc(db, "batteryStates", batteryName), {
        status: targetStateKey,
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("State Machine Write Error: ", err);
    }
  };

  // --- AUTOMATED NOTIFICATION & SMART LIFECYCLE ENGINE ---
  useEffect(() => {
    if (isPracticeMode) return;

    const dispatchSystemAlert = (title, message) => {
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
        new Notification(title, { body: message });
      } else {
        alert(`🚨 ${title.toUpperCase()}\n${message}`);
      }
    };

    // 🧠 SMART STATUS: If inside the queue/countdown pipeline (12 mins out), auto-flag selected battery as IN USE
    if (secondsToMatch <= 720 && secondsToMatch > 0) {
      if (batteryStates[selectedBattery] !== 'IN_USE') {
        transitionBatteryState(selectedBattery, 'IN_USE');
      }
    }

    // 1. Queuing Trigger Alert Condition (Fires immediately upon entering queue pipeline window at 12 mins/720s)
    if (secondsToMatch <= 720 && secondsToMatch > 600 && !alertedQueuing) {
      dispatchSystemAlert(
        `Match #${activeMatchObj.matchNum} Queuing Call!`, 
        `FRC Team 4585 - Robot and Drive Team must proceed to field queue immediately.`
      );
      setAlertedQueuing(true);
    }

    // 2. Critical 10-Minute Warning Alert Condition (Fires exactly at 600 seconds)
    if (secondsToMatch <= 600 && secondsToMatch > 0 && !alertedTenMin) {
      dispatchSystemAlert(
        `Critical 10-Min Warning!`, 
        `Match #${activeMatchObj.matchNum} starts in 10 minutes. Ensure pit checkmarks are locked.`
      );
      setAlertedTenMin(true);
    }
  }, [secondsToMatch, isPracticeMode, alertedQueuing, alertedTenMin, activeMatchObj.matchNum, selectedBattery, batteryStates]);

  // Request browser device permissions framework
  const enableSystemNotifications = async () => {
    if (typeof Notification !== 'undefined') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };

  // --- AUTOMATION ENGINE: SYNC CURRENT EVENT LOCATION & SCHEDULE VIA TBA ---
  useEffect(() => {
    if (!TBA_AUTH_KEY || TBA_AUTH_KEY.includes("YOUR_THE_BLUE_ALLIANCE")) {
      setApiError('Missing TBA Key. Please open App.jsx and paste your secret token into the TBA_AUTH_KEY string constant.');
      setIsPracticeMode(true);
      setCurrentEventName('No API Token Key Found (Practice Mode Active)');
      return;
    }
    
    const discoverActiveEventContext = async () => {
      setIsLoading(true);
      setApiError('');
      try {
        const currentYear = new Date().getFullYear();
        
        const eventsRes = await fetch(`https://www.thebluealliance.com/api/v3/team/frc4585/events/${currentYear}/simple`, {
          headers: { 'X-TBA-Auth-Key': TBA_AUTH_KEY }
        });
        if (!eventsRes.ok) throw new Error('Could not contact Blue Alliance server database registries.');
        const events = await eventsRes.json();

        const todayStr = new Date().toISOString().split('T')[0];
        const activeEvent = events.find(evt => todayStr >= evt.start_date && todayStr <= evt.end_date); 

        if (activeEvent) {
          setIsPracticeMode(false);
          setCurrentEventName(activeEvent.name);
          setCurrentEventKey(activeEvent.key);

          const matchesRes = await fetch(`https://www.thebluealliance.com/api/v3/team/frc4585/event/${activeEvent.key}/matches/simple`, {
            headers: { 'X-TBA-Auth-Key': TBA_AUTH_KEY }
          });
          const rawMatches = await matchesRes.json();
          
          const qualMatches = rawMatches
            .filter(m => m.comp_level === 'qm')
            .sort((a, b) => a.match_number - b.match_number)
            .map((m) => {
              const isDone = compHistory.some(h => String(h.matchNum) === String(m.match_number));
              return {
                matchNum: String(m.match_number),
                status: isDone ? 'completed' : 'scheduled',
                timeLabel: isDone ? 'Completed' : 'Awaiting Pit Action'
              };
            });

          const nextUpcoming = qualMatches.find(m => m.status === 'scheduled');
          if (nextUpcoming) {
            nextUpcoming.status = 'upcoming';
            setSecondsToMatch(720); // 12-Minute simulation start mark pipeline trigger
          }
          setSchedule(qualMatches);
        } else {
          setIsPracticeMode(true);
          setCurrentEventName('No Active Tournament Match Tracked Today (Practice Mode Active)');
          setSchedule([]);
        }
      } catch (err) {
        setApiError(err.message || 'Error executing automated TBA calculations.');
        setIsPracticeMode(true);
        setCurrentEventName('TBA Error (Practice Mode Active)');
      } finally {
        setIsLoading(false);
      }
    };

    discoverActiveEventContext();
  }, [compHistory]);

  useEffect(() => {
    if (isPracticeMode || secondsToMatch <= 0) return;
    const timer = setInterval(() => {
      setSecondsToMatch(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsToMatch, isPracticeMode]);

  useEffect(() => {
    if (isPracticeMode || secondsToMatch <= 0) return;
    const mins = Math.floor(secondsToMatch / 60);
    const secs = secondsToMatch % 60;
    const timeString = `${mins}m ${secs < 10 ? '0' : ''}${secs}s away`;
    setSchedule(prev => prev.map(m => m.status === 'upcoming' ? { ...m, timeLabel: timeString } : m));
  }, [secondsToMatch, isPracticeMode]);

  const allChecked = currentChecklist.every(item => item.checked);
  const batteryFilled = batteryData.preVolts && batteryData.preCharge && batteryData.preResist;
  const systemClearToGo = allChecked && batteryFilled;
  const isTenMinWarning = !isPracticeMode && secondsToMatch <= 600 && secondsToMatch > 0;

  const handleCheckToggle = (id) => {
    const updateFunction = (prev) => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item);
    if (isPracticeMode) {
      setPracticeChecklist(updateFunction);
    } else {
      setCompChecklist(updateFunction);
    }
  };

  const handleBatteryChange = (field, val) => {
    setBatteryData(prev => ({ ...prev, [field]: val }));
  };

  const handleLogMatch = async () => {
    const logEntry = {
      matchNum: isPracticeMode ? `Practice_${Date.now()}` : activeMatchObj.matchNum,
      sessionLabel: currentSessionLabel,
      batteryName: selectedBattery,
      batteryMetrics: { ...batteryData },
      completionPercentage: ((currentChecklist.filter(c => c.checked).length / currentChecklist.length) * 100).toFixed(0),
      timestamp: new Date().toLocaleTimeString(),
      createdAt: new Date().toISOString()
    };

    try {
      // 🧠 SMART LIFECYCLE ROUTER: If post-use fields are filled, it's back on the charger bank!
      const autoNextState = (batteryData.postVolts || batteryData.postCharge) ? 'CHARGING' : 'DEPLETED';

      if (isPracticeMode) {
        await addDoc(collection(db, "practiceHistory"), logEntry);
        await transitionBatteryState(selectedBattery, autoNextState);
        setPracticeChecklist(prev => prev.map(item => ({ ...item, checked: false })));
        alert(`Practice summary saved! Battery automatically moved to ${autoNextState}.`);
      } else {
        await addDoc(collection(db, "compHistory"), logEntry);
        await transitionBatteryState(selectedBattery, autoNextState);
        setCompChecklist(prev => prev.map(item => ({ ...item, checked: false })));
        alert(`Match #${activeMatchObj.matchNum} logs archived. Battery automatically moved to ${autoNextState}!`);
      }
      setBatteryData({ preVolts: '', preCharge: '', preResist: '', postVolts: '', postCharge: '', postResist: '' });
    } catch (e) {
      console.error("Firebase Database Error: ", e);
      alert("Failed to submit telemetry records to Firebase cloud.");
    }
  };

  return (
    <div style={styles.container}>
      {/* BRANDING TOP EMBED ELEMENT */}
      <header style={{ textAlign: 'center', marginBottom: '20px' }}>
        <h1 style={{ 
          fontSize: '32px', 
          fontWeight: '900', 
          margin: 0, 
          fontFamily: '"Arial Black", Gadget, sans-serif', 
          letterSpacing: '-1.5px' 
        }}>
          HUSKY<span style={{ color: theme.green }}>CHECK</span>
        </h1>
        <p style={{ color: theme.muted, fontSize: '11px', margin: '2px 0 12px 0', letterSpacing: '1.5px', textTransform: 'uppercase', fontWeight: 'bold' }}>
          TEAM 4585 AUTOMATED MANAGEMENT
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
          <div style={{ display: 'inline-block', backgroundColor: '#0f172a', color: theme.muted, padding: '4px 12px', borderRadius: '20px', fontSize: '10px', fontWeight: 'bold', border: `1px solid ${theme.border}` }}>
            {isPracticeMode ? '🛰️ PRACTICE ENVIRONMENT ENABLED' : '🏆 FIELD TOURNAMENT ENVIRONMENT ENABLED'}
          </div>
          
          {/* NATIVE SYSTEM PUSH TRIGGER BUTTON CONTROL */}
          {notificationPermission !== 'granted' ? (
            <button onClick={enableSystemNotifications} style={{ background: '#78350F', color: '#F59E0B', border: '1px solid #F59E0B', borderRadius: '6px', fontSize: '11px', padding: '4px 10px', cursor: 'pointer', fontWeight: 'bold' }}>
              🔔 ENABLE PIT PUSH NOTIFICATIONS
            </button>
          ) : (
            <span style={{ color: theme.green, fontSize: '10px', fontWeight: 'bold' }}>⚡ LOCK SCREEN TEXT NOTIFICATIONS ONLINE</span>
          )}
        </div>
      </header>

      {/* DISCOVERED EVENT META DISPLAY HEADER */}
      <div style={{ ...styles.card, textAlign: 'center', padding: '14px' }}>
        <div style={{ fontSize: '10px', color: theme.muted, fontWeight: '800', letterSpacing: '0.5px' }}>📍 ACTIVE TOURNAMENT LOCATION REGISTERED</div>
        <div style={{ color: '#fff', fontSize: '15px', fontWeight: 'bold', marginTop: '4px' }}>{currentEventName}</div>
        {apiError && <div style={{ color: theme.red, fontSize: '11px', marginTop: '6px', fontWeight: 'bold' }}>⚠️ {apiError}</div>}
        {isLoading && <div style={{ color: theme.amber, fontSize: '11px', marginTop: '6px' }}>Syncing TBA API repositories...</div>}
      </div>

      {/* DYNAMIC 10-MINUTE ALERT SYSTEM CRITICAL FIELD BANNER */}
      {isTenMinWarning && (
        <div style={{
          backgroundColor: systemClearToGo ? '#064E3B' : '#7F1D1D',
          border: `2px solid ${systemClearToGo ? theme.green : theme.red}`,
          borderRadius: '12px', padding: '16px', marginBottom: '16px', textAlign: 'center'
        }}>
          <h2 style={{ margin: 0, fontSize: '19px', fontWeight: '900', color: systemClearToGo ? theme.green : '#FFAAAA' }}>
            {systemClearToGo ? '✅ ALL SUB-SYSTEMS GO' : '❌ METRICS INCOMPLETE'}
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: '13px' }}>
            Match #{activeMatchObj.matchNum} steps onto field in {Math.floor(secondsToMatch / 60)}m {secondsToMatch % 60}s!
          </p>
        </div>
      )}

      {/* ROOT NAVIGATION HEADLINES */}
      <nav style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button onClick={() => setActiveTab('check')} style={styles.pickerBtn(activeTab === 'check')}>
          {isPracticeMode ? 'PRACTICE SESSION' : 'PIT CHECKLIST'}
        </button>
        <button onClick={() => setActiveTab('schedule')} style={styles.pickerBtn(activeTab === 'schedule')}>LIVE SCHEDULE</button>
        <button onClick={() => setActiveTab('analytics')} style={styles.pickerBtn(activeTab === 'analytics')}>BATTERY MANAGEMENT</button>
      </nav>

      <main style={{ maxWidth: '500px', margin: '0 auto' }}>
        {/* TAB CORE VIEWPORT 1: CHECKLIST AND FORM DATA CAPTURES */}
        {activeTab === 'check' && (
          <div>
            <div style={styles.card}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '12px' }}>
                <div>
                  <label style={{ fontSize: '10px', color: theme.muted, fontWeight: '800' }}>AUTOMATED TARGET MATCH</label>
                  <input style={{ ...styles.input, color: theme.green, fontWeight: 'bold' }} value={currentSessionLabel} readOnly />
                </div>
                <div>
                  <label style={{ fontSize: '10px', color: theme.muted, fontWeight: '800' }}>BATTERY ALLOCATION KEY</label>
                  <select style={styles.input} value={selectedBattery} onChange={(e) => setSelectedBattery(e.target.value)}>
                    {BATTERY_LIST.map(b => {
                      const currentState = batteryStates[b] || 'READY';
                      return (
                        <option key={b} value={b}>
                          {b} [{BATTERY_STATES[currentState]?.label || currentState}]
                        </option>
                      );
                    })}
                  </select>
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '12px', marginBottom: '4px' }}>
              {CATEGORIES.map(cat => (
                <button key={cat} onClick={() => setSelectedSubCat(cat)} style={styles.pickerBtn(selectedSubCat === cat)}>
                  {cat} ({currentChecklist.filter(i => i.cat === cat && i.checked).length}/{currentChecklist.filter(i => i.cat === cat).length})
                </button>
              ))}
            </div>

            <div style={{ ...styles.card, borderLeft: `6px solid ${theme.green}` }}>
              <h3 style={{ margin: '0 0 14px 0', fontSize: '15px', fontWeight: '900' }}>
                {isPracticeMode ? 'PRACTICE LABORATORY' : 'QUALIFICATION ARENA'} - {selectedSubCat.toUpperCase()}
              </h3>
              
              {currentChecklist.filter(item => item.cat === selectedSubCat).map(item => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', borderBottom: `1px solid ${theme.border}44` }}>
                  <div style={{ display: 'flex', flexDirection: 'column', marginRight: '10px' }}>
                    <span style={{ fontSize: '14px', textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? theme.muted : theme.text }}>
                      {item.task}
                    </span>
                    <span style={{ fontSize: '10px', color: theme.green, marginTop: '2px', fontWeight: 'bold' }}>
                      ⚙️ Tool/Method: {item.tool}
                    </span>
                  </div>
                  <input 
                    type="checkbox" checked={item.checked} onChange={() => handleCheckToggle(item.id)}
                    style={{ width: '22px', height: '22px', accentColor: theme.green, cursor: 'pointer', flexShrink: 0 }} 
                  />
                </div>
              ))}
            </div>

            <div style={{ ...styles.card, borderLeft: `6px solid ${batteryFilled ? theme.green : theme.amber}` }}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '15px', fontWeight: '900' }}>
                {isPracticeMode ? 'PRACTICE BATTERY METRIC LOGGER' : 'COMPETITION BATTERY METRIC LOGGER'}
              </h3>
              <p style={{ color: theme.muted, fontSize: '11px', margin: '0 0 15px 0' }}>Data metrics here are logged to isolated histories depending on active mode.</p>

              <h4 style={{ margin: '0 0 8px 0', fontSize: '11px', color: theme.green }}>PRE-USE STATUS VARIABLE BLOCKS</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
                <div><label style={{ fontSize: '10px', color: theme.muted }}>VOLTS</label><input placeholder="13.2" style={styles.input} type="number" step="0.01" value={batteryData.preVolts} onChange={e => handleBatteryChange('preVolts', e.target.value)} /></div>
                <div><label style={{ fontSize: '10px', color: theme.muted }}>% CHARGE</label><input placeholder="100" style={styles.input} type="number" value={batteryData.preCharge} onChange={e => handleBatteryChange('preCharge', e.target.value)} /></div>
                <div><label style={{ fontSize: '10px', color: theme.muted }}>R (mΩ)</label><input placeholder="14.1" style={styles.input} type="number" step="0.1" value={batteryData.preResist} onChange={e => handleBatteryChange('preResist', e.target.value)} /></div>
              </div>

              <h4 style={{ margin: '0 0 8px 0', fontSize: '11px', color: theme.amber }}>POST-USE POST-MORTEM EVALUATION</h4>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div><label style={{ fontSize: '10px', color: theme.muted }}>VOLTS</label><input placeholder="12.0" style={styles.input} type="number" step="0.01" value={batteryData.postVolts} onChange={e => handleBatteryChange('postVolts', e.target.value)} /></div>
                <div><label style={{ fontSize: '10px', color: theme.muted }}>% CHARGE</label><input placeholder="55" style={styles.input} type="number" value={batteryData.postCharge} onChange={e => handleBatteryChange('postCharge', e.target.value)} /></div>
                <div><label style={{ fontSize: '10px', color: theme.muted }}>R (mΩ)</label><input placeholder="15.8" style={styles.input} type="number" step="0.1" value={batteryData.postResist} onChange={e => handleBatteryChange('postResist', e.target.value)} /></div>
              </div>
            </div>

            <button style={styles.submitBtn} onClick={handleLogMatch}>
              SUBMIT & ARCHIVE SUMMARY DATA
            </button>
          </div>
        )}

        {/* TAB CORE VIEWPORT 2: LIVE TOURNAMENT TIMELINES AND BUFFERS */}
        {activeTab === 'schedule' && (
          <div>
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', fontWeight: '900' }}>TBA DYNAMIC SCHEDULE LAYOUT</h3>
              {schedule.length === 0 ? (
                <p style={{ color: theme.muted, fontSize: '13px', textAlign: 'center', padding: '24px 0' }}>
                  No active tournament streams discovered on the API for Team 4585 today. Localized practice environments are running.
                </p>
              ) : (
                schedule.map((m) => (
                  <div key={m.matchNum} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px', borderRadius: '10px', backgroundColor: '#0F172A', marginBottom: '10px', border: `1px solid ${m.status === 'upcoming' ? theme.green : theme.border}` }}>
                    <div>
                      <span style={{ fontWeight: 'bold', fontSize: '15px', color: m.status === 'upcoming' ? theme.green : theme.text }}>Qualification Match #{m.matchNum}</span>
                      <div style={{ fontSize: '11px', color: theme.muted, marginTop: '2px' }}>Event Signature Hook: {currentEventKey}</div>
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 'bold', color: m.status === 'completed' ? theme.muted : m.status === 'upcoming' ? theme.green : theme.amber }}>
                      {m.timeLabel}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB CORE VIEWPORT 3: STATE MACHINE AND HISTORIES */}
        {activeTab === 'analytics' && (
          <div>
            {/* 🔋 STATE MACHINE DASHBOARD COMPONENT */}
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 4px 0', fontSize: '16px', fontWeight: '900', color: theme.text }}>🔋 PIT POOL STATE MACHINE</h3>
              <p style={{ color: theme.muted, fontSize: '11px', margin: '0 0 16px 0' }}>Instantly updates all pit devices when battery statuses flip.</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {BATTERY_LIST.map(b => {
                  const currentStatus = batteryStates[b] || 'READY';
                  const currentCfg = BATTERY_STATES[currentStatus] || BATTERY_STATES.READY;
                  
                  return (
                    <div key={b} style={{ border: `1px solid ${theme.border}`, borderRadius: '10px', padding: '12px', backgroundColor: '#0F172A' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold' }}>{b}</span>
                        <span style={{ fontSize: '11px', fontWeight: '900', color: currentCfg.color, backgroundColor: currentCfg.bg, padding: '4px 10px', borderRadius: '6px' }}>
                          {currentCfg.label}
                        </span>
                      </div>
                      
                      {/* State Machine Transition Selector Buttons */}
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {Object.keys(BATTERY_STATES).map(stateKey => (
                          <button 
                            key={stateKey} 
                            onClick={() => transitionBatteryState(b, stateKey)}
                            style={{
                              flex: 1, padding: '6px 2px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer', border: 'none',
                              backgroundColor: currentStatus === stateKey ? BATTERY_STATES[stateKey].color : theme.card,
                              color: currentStatus === stateKey ? '#0F172A' : theme.muted
                            }}
                          >
                            {stateKey}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* TOURNAMENT LOG CELL */}
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '900', color: theme.green }}>🏆 OFFICIAL COMPETITION REVIEWS</h3>
              {compHistory.length === 0 ? (
                <p style={{ color: theme.muted, fontSize: '12px' }}>No matches written to tournament database logs yet.</p>
              ) : (
                compHistory.map((entry) => (
                  <div key={entry.id} style={{ padding: '10px', backgroundColor: '#0F172A', borderRadius: '8px', marginBottom: '8px', fontSize: '12px', border: `1px solid ${theme.border}` }}>
                    <strong>{entry.sessionLabel}</strong> | {entry.batteryName}<br />
                    <span style={{ color: theme.muted }}>Pre: {entry.batteryMetrics.preVolts}V | Post: {entry.batteryMetrics.postVolts || '--'}V | Checked: {entry.completionPercentage}%</span>
                  </div>
                ))
              )}
            </div>

            {/* SEPARATED PRACTICE SYSTEM HISTORY LOG FILE CELL */}
            <div style={styles.card}>
              <h3 style={{ margin: '0 0 12px 0', fontSize: '16px', fontWeight: '900', color: theme.green }}>⚙️ PRACTICE SESSION REVIEWS</h3>
              {practiceHistory.length === 0 ? (
                <p style={{ color: theme.muted, fontSize: '12px' }}>No entries found inside localized lab records.</p>
              ) : (
                practiceHistory.map((entry) => (
                  <div key={entry.id} style={{ padding: '10px', backgroundColor: '#0F172A', borderRadius: '8px', marginBottom: '8px', fontSize: '12px', border: `1px solid ${theme.border}` }}>
                    <strong>{entry.sessionLabel}</strong> | {entry.batteryName}<br />
                    <span style={{ color: theme.muted }}>Pre: {entry.batteryMetrics.preVolts}V | Post: {entry.batteryMetrics.postVolts || '--'}V | Progress: {entry.completionPercentage}%</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// Injection Ignition switch element
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);