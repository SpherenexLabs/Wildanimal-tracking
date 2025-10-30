// App.js
import React, { useEffect, useState, useRef } from 'react';
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

// Function to calculate distance between two coordinates (Haversine formula)
const calculateDistance = (lat1, lon1, lat2, lon2) => {
  const R = 6371; // Radius of Earth in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c; // Distance in kilometers
  return distance;
};

function App() {
  const [animalData, setAnimalData] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  
  // Location tracking states
  const [currentLocation, setCurrentLocation] = useState(null);
  const [baseLocation, setBaseLocation] = useState(null);
  const [distanceFromBase, setDistanceFromBase] = useState(0);
  const [boundaryAlert, setBoundaryAlert] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [isMoving, setIsMoving] = useState(false);
  
  const BOUNDARY_RADIUS = 1; // 1km boundary
  const WARNING_DISTANCE = 0.8; // Start warning at 800m (0.8km)
  const watchIdRef = useRef(null);
  const previousMotionRef = useRef(0);

  // Get current location and set up tracking
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    // Get initial position
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        setCurrentLocation(location);
        
        // Set as base location if not already set
        if (!baseLocation) {
          setBaseLocation(location);
        }
        
        setLocationError(null);
      },
      (error) => {
        setLocationError(`Location error: ${error.message}`);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0
      }
    );

    // Watch position continuously
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          timestamp: position.timestamp
        };
        setCurrentLocation(location);
      },
      (error) => {
        console.error('Watch position error:', error);
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );

    // Cleanup
    return () => {
      if (watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [baseLocation]);

  // Check motion and boundary distance
  useEffect(() => {
    if (!currentLocation || !baseLocation || !animalData) return;

    // Calculate distance from base location
    const distance = calculateDistance(
      baseLocation.latitude,
      baseLocation.longitude,
      currentLocation.latitude,
      currentLocation.longitude
    );
    setDistanceFromBase(distance);

    // Check motion (detect if animal is moving based on motion sensor)
    const currentMotion = animalData.motion_mps2 || 0;
    const motionThreshold = 0.5; // m/s² threshold to consider as moving
    const isCurrentlyMoving = currentMotion > motionThreshold;
    setIsMoving(isCurrentlyMoving);

    // Check if motion is increasing (animal accelerating towards boundary)
    const isAccelerating = currentMotion > previousMotionRef.current;
    previousMotionRef.current = currentMotion;

    // Boundary alerts
    if (distance >= BOUNDARY_RADIUS) {
      setBoundaryAlert({
        type: 'critical',
        message: `🚨 BOUNDARY CROSSED! Animal is ${distance.toFixed(2)}km from base location!`,
        distance: distance,
        action: 'immediate'
      });
      
      // Play alert sound
      playAlertSound('critical');
      
    } else if (distance >= WARNING_DISTANCE && isCurrentlyMoving) {
      setBoundaryAlert({
        type: 'warning',
        message: `⚠️ Approaching boundary! ${distance.toFixed(2)}km from base (${(BOUNDARY_RADIUS - distance).toFixed(2)}km remaining)`,
        distance: distance,
        action: 'monitor',
        moving: true,
        accelerating: isAccelerating
      });
      
      // Play warning sound if accelerating
      if (isAccelerating) {
        playAlertSound('warning');
      }
      
    } else if (distance >= WARNING_DISTANCE) {
      setBoundaryAlert({
        type: 'caution',
        message: `⚠️ Near boundary: ${distance.toFixed(2)}km from base`,
        distance: distance,
        action: 'observe'
      });
      
    } else {
      setBoundaryAlert(null);
    }

  }, [currentLocation, baseLocation, animalData, BOUNDARY_RADIUS, WARNING_DISTANCE]);

  // Play alert sound function
  const playAlertSound = (type) => {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = type === 'critical' ? 800 : 600;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.error('Audio error:', error);
    }
  };

  // Reset base location function
  const resetBaseLocation = () => {
    if (currentLocation) {
      setBaseLocation(currentLocation);
      setBoundaryAlert(null);
      setDistanceFromBase(0);
    }
  };

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
        {/* Location Tracking Section */}
        {currentLocation && (
          <div className="location-tracking-section">
            <h2 className="section-title">📍 Location & Boundary Tracking</h2>
            <div className="location-cards">
              <div className="location-card">
                <div className="location-icon">🎯</div>
                <div className="location-content">
                  <h4>Base Location</h4>
                  {baseLocation ? (
                    <>
                      <div className="location-coords">
                        Lat: {baseLocation.latitude.toFixed(6)}°
                      </div>
                      <div className="location-coords">
                        Lon: {baseLocation.longitude.toFixed(6)}°
                      </div>
                      <button className="reset-button" onClick={resetBaseLocation}>
                        Reset to Current
                      </button>
                    </>
                  ) : (
                    <div>Setting base location...</div>
                  )}
                </div>
              </div>

              <div className="location-card">
                <div className="location-icon">📍</div>
                <div className="location-content">
                  <h4>Current Location</h4>
                  <div className="location-coords">
                    Lat: {currentLocation.latitude.toFixed(6)}°
                  </div>
                  <div className="location-coords">
                    Lon: {currentLocation.longitude.toFixed(6)}°
                  </div>
                  <div className="location-accuracy">
                    Accuracy: ±{currentLocation.accuracy?.toFixed(0)}m
                  </div>
                </div>
              </div>

              <div className={`location-card distance-card ${distanceFromBase >= WARNING_DISTANCE ? 'warning' : ''} ${distanceFromBase >= BOUNDARY_RADIUS ? 'critical' : ''}`}>
                <div className="location-icon">📏</div>
                <div className="location-content">
                  <h4>Distance from Base</h4>
                  <div className="distance-value">
                    {distanceFromBase.toFixed(2)} km
                  </div>
                  <div className="distance-progress">
                    <div 
                      className="progress-bar"
                      style={{ 
                        width: `${Math.min((distanceFromBase / BOUNDARY_RADIUS) * 100, 100)}%`,
                        backgroundColor: distanceFromBase >= BOUNDARY_RADIUS ? '#f44336' : 
                                       distanceFromBase >= WARNING_DISTANCE ? '#ff9800' : '#4caf50'
                      }}
                    ></div>
                  </div>
                  <div className="distance-info">
                    Boundary: {BOUNDARY_RADIUS}km | Remaining: {Math.max(0, BOUNDARY_RADIUS - distanceFromBase).toFixed(2)}km
                  </div>
                </div>
              </div>

              <div className={`location-card motion-card ${isMoving ? 'moving' : 'stationary'}`}>
                <div className="location-icon">{isMoving ? '🏃' : '🧍'}</div>
                <div className="location-content">
                  <h4>Motion Status</h4>
                  <div className="motion-status">
                    {isMoving ? 'Moving' : 'Stationary'}
                  </div>
                  <div className="motion-value">
                    {animalData?.motion_mps2?.toFixed(2) || 0} m/s²
                  </div>
                  {isMoving && distanceFromBase >= WARNING_DISTANCE && (
                    <div className="motion-warning">
                      ⚠️ Moving towards boundary
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Visual Boundary Map */}
        {currentLocation && baseLocation && (
          <div className="boundary-map-section">
            <h2 className="section-title">🗺️ Boundary Visualization</h2>
            <div className="boundary-map-container">
              <div className="map-canvas">
                {/* Boundary circles */}
                <div className="boundary-circle outer-boundary">
                  <span className="boundary-label">1 km Boundary</span>
                </div>
                <div className="boundary-circle warning-zone">
                  <span className="boundary-label">800m Warning Zone</span>
                </div>
                <div className="boundary-circle safe-zone">
                  <span className="boundary-label">Safe Zone</span>
                </div>
                
                {/* Base location marker */}
                <div className="location-marker base-marker">
                  <div className="marker-icon">🏠</div>
                  <div className="marker-label">Base</div>
                </div>
                
                {/* Animal position marker - calculated based on distance and angle */}
                <div 
                  className={`location-marker animal-marker ${isMoving ? 'moving' : ''}`}
                  style={{
                    left: `calc(50% + ${(distanceFromBase / BOUNDARY_RADIUS) * 40}%)`,
                    top: `calc(50% - ${(distanceFromBase / BOUNDARY_RADIUS) * 30}%)`,
                    opacity: distanceFromBase >= BOUNDARY_RADIUS ? 1 : 0.9
                  }}
                >
                  <div className="marker-icon animal-icon">🐾</div>
                  <div className="marker-label">Animal</div>
                  {isMoving && <div className="motion-indicator">→</div>}
                </div>

                {/* Distance indicator line */}
                <svg className="distance-line" width="100%" height="100%">
                  <line 
                    x1="50%" 
                    y1="50%" 
                    x2={`calc(50% + ${(distanceFromBase / BOUNDARY_RADIUS) * 40}%)`}
                    y2={`calc(50% - ${(distanceFromBase / BOUNDARY_RADIUS) * 30}%)`}
                    stroke={distanceFromBase >= BOUNDARY_RADIUS ? '#f44336' : 
                           distanceFromBase >= WARNING_DISTANCE ? '#ff9800' : '#4caf50'}
                    strokeWidth="2"
                    strokeDasharray="5,5"
                  />
                </svg>

                {/* Compass directions */}
                <div className="compass-overlay">
                  <div className="compass-n">N</div>
                  <div className="compass-s">S</div>
                  <div className="compass-e">E</div>
                  <div className="compass-w">W</div>
                </div>

                {/* Distance scale */}
                <div className="distance-scale">
                  <div className="scale-line"></div>
                  <div className="scale-markers">
                    <span>0m</span>
                    <span>500m</span>
                    <span>1km</span>
                  </div>
                </div>

                {/* Status indicator */}
                <div className={`map-status ${distanceFromBase >= BOUNDARY_RADIUS ? 'critical' : distanceFromBase >= WARNING_DISTANCE ? 'warning' : 'safe'}`}>
                  <div className="status-icon">
                    {distanceFromBase >= BOUNDARY_RADIUS ? '🚨' : 
                     distanceFromBase >= WARNING_DISTANCE ? '⚠️' : '✅'}
                  </div>
                  <div className="status-text">
                    {distanceFromBase >= BOUNDARY_RADIUS ? 'OUTSIDE BOUNDARY' : 
                     distanceFromBase >= WARNING_DISTANCE ? 'APPROACHING LIMIT' : 'WITHIN SAFE ZONE'}
                  </div>
                  <div className="status-distance">
                    {(distanceFromBase * 1000).toFixed(0)}m from base
                  </div>
                </div>
              </div>

              {/* Map legend */}
              <div className="map-legend">
                <h4>Legend</h4>
                <div className="legend-row">
                  <span className="legend-symbol safe"></span>
                  <span>Safe Zone (0-800m)</span>
                </div>
                <div className="legend-row">
                  <span className="legend-symbol warning"></span>
                  <span>Warning Zone (800m-1km)</span>
                </div>
                <div className="legend-row">
                  <span className="legend-symbol danger"></span>
                  <span>Boundary (1km)</span>
                </div>
                <div className="legend-row">
                  <span className="legend-symbol">🏠</span>
                  <span>Base Location</span>
                </div>
                <div className="legend-row">
                  <span className="legend-symbol">🐾</span>
                  <span>Animal Position</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Location Error */}
        {locationError && (
          <div className="alert-banner error-alert">
            ❌ {locationError}
          </div>
        )}

        {/* Boundary Alert */}
        {boundaryAlert && (
          <div className={`alert-banner boundary-alert ${boundaryAlert.type}`}>
            <div className="alert-content-main">
              <div className="alert-text">{boundaryAlert.message}</div>
              {boundaryAlert.moving && (
                <div className="alert-subtext">
                  Animal is in motion{boundaryAlert.accelerating ? ' and accelerating' : ''}!
                </div>
              )}
            </div>
            <div className="alert-action">
              Action: {boundaryAlert.action.toUpperCase()}
            </div>
          </div>
        )}

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
