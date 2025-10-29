// App.js
import React, { useEffect, useState } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue } from 'firebase/database';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import './Wildanimaltracking.css';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAhLCi6JBT5ELkAFxTplKBBDdRdpATzQxI",
  authDomain: "smart-medicine-vending-machine.firebaseapp.com",
  databaseURL: "https://smart-medicine-vending-machine-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "smart-medicine-vending-machine",
  storageBucket: "smart-medicine-vending-machine.firebasestorage.app",
  messagingSenderId: "705021997077",
  appId: "1:705021997077:web:5af9ec0b267e597e1d5e1c",
  measurementId: "G-PH0XLJSYVS"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

// Health status thresholds (Configurable based on animal type)
const THRESHOLDS = {
  heartRate: {
    healthy: { min: 60, max: 100 },    // Normal range
    atRisk: { min: 45, max: 130 },     // Warning range
    // Below 45 or above 130 = Critical
  },
  spo2: {
    healthy: { min: 95, max: 100 },    // Normal oxygen saturation
    atRisk: { min: 90, max: 94 },      // Low oxygen warning
    // Below 90 = Critical
  },
  bpSystolic: {
    healthy: { min: 110, max: 140 },   // Normal systolic
    atRisk: { min: 90, max: 160 },     // Elevated/low BP warning
    // Below 90 or above 160 = Critical
  },
  temperature: {
    healthy: { min: 36.5, max: 38.5 }, // Normal core temp (Celsius)
    atRisk: { min: 35.5, max: 39.5 },  // Mild fever/hypothermia
    // Below 35.5 or above 39.5 = Critical
  }
};

// Function to determine health status
const getHealthStatus = (value, type) => {
  const threshold = THRESHOLDS[type];
  
  if (value >= threshold.healthy.min && value <= threshold.healthy.max) {
    return { status: 'healthy', label: 'Healthy', color: '#4caf50' };
  } else if (value >= threshold.atRisk.min && value <= threshold.atRisk.max) {
    return { status: 'at-risk', label: 'At Risk', color: '#ff9800' };
  } else {
    return { status: 'critical', label: 'Critical', color: '#f44336' };
  }
};

function App() {
  const [animalData, setAnimalData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    const animalRef = ref(database, 'animal_monitor');

    const unsubscribe = onValue(animalRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        setAnimalData(data);
        setLoading(false);

        // Check for critical alerts
        const newAlerts = [];
        
        const hrStatus = getHealthStatus(data.hr_bpm || 0, 'heartRate');
        const spo2Status = getHealthStatus(data.spo2_pct || 0, 'spo2');
        const bpStatus = getHealthStatus(data.bp_sys || 0, 'bpSystolic');
        const tempStatus = getHealthStatus(data.tcore_c || 0, 'temperature');

        if (hrStatus.status === 'critical') {
          newAlerts.push({ type: 'Heart Rate', value: data.hr_bpm, message: 'Critical heart rate detected!' });
        } else if (hrStatus.status === 'at-risk') {
          newAlerts.push({ type: 'Heart Rate', value: data.hr_bpm, message: 'Heart rate at risk level' });
        }

        if (spo2Status.status === 'critical') {
          newAlerts.push({ type: 'SpO2', value: data.spo2_pct, message: 'Critical oxygen saturation!' });
        } else if (spo2Status.status === 'at-risk') {
          newAlerts.push({ type: 'SpO2', value: data.spo2_pct, message: 'Low oxygen saturation' });
        }

        if (bpStatus.status === 'critical') {
          newAlerts.push({ type: 'Blood Pressure', value: data.bp_sys, message: 'Critical blood pressure!' });
        } else if (bpStatus.status === 'at-risk') {
          newAlerts.push({ type: 'Blood Pressure', value: data.bp_sys, message: 'Blood pressure abnormal' });
        }

        if (tempStatus.status === 'critical') {
          newAlerts.push({ type: 'Temperature', value: data.tcore_c, message: 'Critical temperature level!' });
        } else if (tempStatus.status === 'at-risk') {
          newAlerts.push({ type: 'Temperature', value: data.tcore_c, message: 'Temperature abnormal' });
        }

        setAlerts(newAlerts);

        // Add to history for graphs
        const timestamp = new Date().toLocaleTimeString();
        setHistoryData(prev => {
          const newData = [...prev, {
            time: timestamp,
            heartRate: data.hr_bpm || 0,
            spo2: data.spo2_pct || 0,
            bpSys: data.bp_sys || 0,
            bpDia: data.bp_dia || 0,
            temp: data.tcore_c || 0,
            respiratoryRate: data.hsurr_pct || 0
          }];
          return newData.slice(-20);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="loading-container">
        <div className="loader"></div>
        <p>Loading animal monitoring data...</p>
      </div>
    );
  }

  const hrStatus = getHealthStatus(animalData?.hr_bpm || 0, 'heartRate');
  const spo2Status = getHealthStatus(animalData?.spo2_pct || 0, 'spo2');
  const bpStatus = getHealthStatus(animalData?.bp_sys || 0, 'bpSystolic');
  const tempStatus = getHealthStatus(animalData?.tcore_c || 0, 'temperature');

  return (
    <div className="app-container">
      <header className="header">
        <h1>🐾 Animal Health Monitoring System</h1>
        <div className="last-update">
          Last Update: {new Date(animalData?.last_update_ms || Date.now()).toLocaleString()}
        </div>
      </header>

      <div className="dashboard">
        {/* Critical Alerts Section */}
        {alerts.length > 0 && (
          <div className="alerts-section">
            <h2 className="alerts-title">⚠️ Active Alerts</h2>
            <div className="alerts-grid">
              {alerts.map((alert, index) => (
                <div 
                  key={index} 
                  className={`alert-card ${alert.message.includes('Critical') ? 'critical-alert' : 'warning-alert'}`}
                >
                  <div className="alert-icon">
                    {alert.message.includes('Critical') ? '🚨' : '⚠️'}
                  </div>
                  <div className="alert-content">
                    <div className="alert-type">{alert.type}</div>
                    <div className="alert-message">{alert.message}</div>
                    <div className="alert-value">Current: {alert.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Struggle Flag Alert */}
        {animalData?.struggle_flag === 1 && (
          <div className="alert-banner struggle-alert">
            🚨 ALERT: Animal Struggle Detected!
          </div>
        )}

        {/* Vital Signs Cards with Status Indicators */}
        <div className="cards-container">
          {/* Heart Rate Card with Status */}
          <div className="card heart-rate" style={{ borderLeftColor: hrStatus.color }}>
            <div className="card-icon">❤️</div>
            <div className="card-content">
              <div className="card-header">
                <h3>Heart Rate</h3>
                <span className={`status-badge ${hrStatus.status}`} style={{ backgroundColor: hrStatus.color }}>
                  {hrStatus.label}
                </span>
              </div>
              <div className="card-value">{animalData?.hr_bpm || 0}</div>
              <div className="card-unit">BPM</div>
              <div className="card-range">Normal: 60-100 BPM</div>
            </div>
          </div>

          {/* SpO2 Card with Status */}
          <div className="card spo2" style={{ borderLeftColor: spo2Status.color }}>
            <div className="card-icon">🫁</div>
            <div className="card-content">
              <div className="card-header">
                <h3>SpO2</h3>
                <span className={`status-badge ${spo2Status.status}`} style={{ backgroundColor: spo2Status.color }}>
                  {spo2Status.label}
                </span>
              </div>
              <div className="card-value">{animalData?.spo2_pct || 0}</div>
              <div className="card-unit">%</div>
              <div className="card-range">Normal: 95-100%</div>
            </div>
          </div>

          {/* Blood Pressure Card with Status */}
          <div className="card blood-pressure" style={{ borderLeftColor: bpStatus.color }}>
            <div className="card-icon">🩺</div>
            <div className="card-content">
              <div className="card-header">
                <h3>Blood Pressure</h3>
                <span className={`status-badge ${bpStatus.status}`} style={{ backgroundColor: bpStatus.color }}>
                  {bpStatus.label}
                </span>
              </div>
              <div className="card-value">
                {animalData?.bp_sys || 0}/{animalData?.bp_dia || 0}
              </div>
              <div className="card-unit">mmHg (Sys/Dia)</div>
              <div className="card-range">Normal: 110-140 mmHg</div>
            </div>
          </div>

          {/* Temperature Card with Status */}
          <div className="card temperature" style={{ borderLeftColor: tempStatus.color }}>
            <div className="card-icon">🌡️</div>
            <div className="card-content">
              <div className="card-header">
                <h3>Core Temperature</h3>
                <span className={`status-badge ${tempStatus.status}`} style={{ backgroundColor: tempStatus.color }}>
                  {tempStatus.label}
                </span>
              </div>
              <div className="card-value">{animalData?.tcore_c || 0}</div>
              <div className="card-unit">°C</div>
              <div className="card-range">Normal: 36.5-38.5°C</div>
            </div>
          </div>

          {/* Other Vitals Cards */}
          <div className="card respiratory">
            <div className="card-icon">🌬️</div>
            <div className="card-content">
              <h3>Respiratory Rate</h3>
              <div className="card-value">{animalData?.hsurr_pct || 0}</div>
              <div className="card-unit">%</div>
            </div>
          </div>

          <div className="card motion">
            <div className="card-icon">🏃</div>
            <div className="card-content">
              <h3>Motion</h3>
              <div className="card-value">{animalData?.motion_mps2?.toFixed(2) || 0}</div>
              <div className="card-unit">m/s²</div>
            </div>
          </div>

          <div className="card bp-signal">
            <div className="card-icon">📊</div>
            <div className="card-content">
              <h3>BP Signal Amplitude</h3>
              <div className="card-value">{animalData?.bpsig_amp || 0}</div>
              <div className="card-unit">Units</div>
            </div>
          </div>

          <div className="card surface-temp">
            <div className="card-icon">🔥</div>
            <div className="card-content">
              <h3>Surface Temperature</h3>
              <div className="card-value">{animalData?.tsurr_c || 0}</div>
              <div className="card-unit">°C</div>
            </div>
          </div>
        </div>

        {/* Health Status Legend */}
        <div className="legend-container">
          <h3>Health Status Legend</h3>
          <div className="legend-items">
            <div className="legend-item">
              <span className="legend-color healthy"></span>
              <span>Healthy - Normal Range</span>
            </div>
            <div className="legend-item">
              <span className="legend-color at-risk"></span>
              <span>At Risk - Requires Monitoring</span>
            </div>
            <div className="legend-item">
              <span className="legend-color critical"></span>
              <span>Critical - Immediate Attention Required</span>
            </div>
          </div>
        </div>

        {/* Real-time Graphs */}
        <div className="graphs-container">
          <div className="graph-card">
            <h3>Heart Rate & SpO2 Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={historyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="heartRate" stroke="#ff6b6b" name="Heart Rate (BPM)" strokeWidth={2} />
                <Line type="monotone" dataKey="spo2" stroke="#4ecdc4" name="SpO2 (%)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="graph-card">
            <h3>Blood Pressure Trends</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={historyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="bpSys" stroke="#ff6b6b" name="Systolic (mmHg)" strokeWidth={2} />
                <Line type="monotone" dataKey="bpDia" stroke="#95e1d3" name="Diastolic (mmHg)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="graph-card">
            <h3>Temperature Monitoring</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={historyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="temp" stroke="#f38181" name="Core Temp (°C)" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
