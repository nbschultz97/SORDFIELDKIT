import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  FlatList,
  Image,
  Platform,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import MapView, { Marker } from 'react-native-maps';
import * as Location from 'expo-location';
import { BleManager } from 'react-native-ble-plx';
import { Camera } from 'expo-camera';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { PermissionsAndroid } from 'react-native';

const WAYPOINTS_KEY = 'sord_quicknote_waypoints_v1';
const FORMS_KEY = 'sord_quicknote_forms_v1';
const PHOTO_NOTES_KEY = 'sord_quicknote_photo_notes_v1';
const BLE_HISTORY_KEY = 'sord_quicknote_ble_history_v1';

const Tab = createBottomTabNavigator();

const appTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: '#0f1115',
    card: '#161920',
    primary: '#4cd964',
    text: '#f4f6f9',
    border: '#232631',
  },
};

const templateFields = {
  nineLine: [
    { key: 'line1', label: 'Line 1 - Location', placeholder: 'Grid / LatLong' },
    { key: 'line2', label: 'Line 2 - Radio Frequency', placeholder: 'Freq & Call Sign' },
    { key: 'line3', label: 'Line 3 - Number of Patients by Precedence', placeholder: 'Urgent, Priority…' },
    { key: 'line4', label: 'Line 4 - Special Equipment', placeholder: 'Hoist, Ventilator…' },
    { key: 'line5', label: 'Line 5 - Number of Patients by Type', placeholder: 'Litter, Ambulatory…' },
    { key: 'line6', label: 'Line 6 - Security of Pickup Site', placeholder: 'No enemy / Possible / In contact' },
    { key: 'line7', label: 'Line 7 - Method of Marking', placeholder: 'Panels, Smoke…' },
    { key: 'line8', label: 'Line 8 - Patient Nationality', placeholder: 'US, Non-US, EPW…' },
    { key: 'line9', label: 'Line 9 - NBC Contamination', placeholder: 'None / Nuclear / Biological / Chemical' },
  ],
  salute: [
    { key: 'size', label: 'Size', placeholder: 'Enemy strength' },
    { key: 'activity', label: 'Activity', placeholder: 'What are they doing?' },
    { key: 'location', label: 'Location', placeholder: 'Precise location info' },
    { key: 'unit', label: 'Unit / Uniform', placeholder: 'Marks, unit ID' },
    { key: 'time', label: 'Time', placeholder: 'When observed' },
    { key: 'equipment', label: 'Equipment', placeholder: 'Weapons, transport…' },
  ],
};

const defaultRegion = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08,
};

async function readJson(key, fallback) {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw);
  } catch (error) {
    console.warn('readJson error', key, error);
    return fallback;
  }
}

async function writeJson(key, value) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn('writeJson error', key, error);
  }
}

function TabIcon({ color, name }) {
  return <Ionicons name={name} size={22} color={color} />;
}

function SectionHeader({ title, actionLabel, onAction }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction}>
          <Text style={styles.sectionAction}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

function MapScreen() {
  const [hasPermission, setHasPermission] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [waypoints, setWaypoints] = useState([]);
  const [loadingLocation, setLoadingLocation] = useState(true);
  const [statusMessage, setStatusMessage] = useState('Requesting GPS...');
  const mapRef = useRef(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const stored = await readJson(WAYPOINTS_KEY, []);
      if (mounted) {
        setWaypoints(stored);
      }
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (!mounted) {
        return;
      }
      if (status !== 'granted') {
        setHasPermission(false);
        setStatusMessage('Location permission denied. Enable it in settings to view the map.');
        setLoadingLocation(false);
        return;
      }
      setHasPermission(true);
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      if (mounted) {
        setCurrentLocation(location.coords);
        setLoadingLocation(false);
        setStatusMessage('Long press on the map to drop a waypoint.');
        if (mapRef.current && location?.coords) {
          mapRef.current.animateToRegion({
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleAddWaypoint = coordinate => {
    const timestamp = new Date().toISOString();
    const waypoint = {
      id: `${Date.now()}`,
      name: `WP-${waypoints.length + 1}`,
      latitude: coordinate.latitude,
      longitude: coordinate.longitude,
      timestamp,
    };
    const updated = [...waypoints, waypoint];
    setWaypoints(updated);
    writeJson(WAYPOINTS_KEY, updated);
    setStatusMessage(`Stored ${waypoint.name}`);
  };

  const exportWaypoints = async () => {
    if (!waypoints.length) {
      Alert.alert('No waypoints saved yet');
      return;
    }
    try {
      const payload = JSON.stringify({ waypoints }, null, 2);
      await Share.share({
        title: 'SORD QuickNote Waypoints',
        message: payload,
      });
    } catch (error) {
      Alert.alert('Share failed', error.message);
    }
  };

  const clearWaypoints = () => {
    Alert.alert('Clear all waypoints?', 'This will remove every stored waypoint.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setWaypoints([]);
          writeJson(WAYPOINTS_KEY, []);
          setStatusMessage('Waypoints cleared');
        },
      },
    ]);
  };

  const centerOnUser = async () => {
    if (!hasPermission) {
      Alert.alert('Location unavailable', 'Grant GPS permissions in system settings.');
      return;
    }
    try {
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.BestForNavigation });
      setCurrentLocation(location.coords);
      if (mapRef.current) {
        mapRef.current.animateToRegion({
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          latitudeDelta: 0.015,
          longitudeDelta: 0.015,
        });
      }
    } catch (error) {
      Alert.alert('Location error', error.message);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.mapContainer}>
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFill}
          initialRegion={currentLocation ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          } : defaultRegion}
          onLongPress={event => handleAddWaypoint(event.nativeEvent.coordinate)}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {waypoints.map(point => (
            <Marker
              key={point.id}
              coordinate={{ latitude: point.latitude, longitude: point.longitude }}
              title={point.name}
              description={new Date(point.timestamp).toLocaleString()}
            />
          ))}
        </MapView>
        <View style={styles.mapOverlay}>
          <Text style={styles.mapStatus}>{statusMessage}</Text>
          <View style={styles.mapButtons}>
            <TouchableOpacity style={styles.primaryButton} onPress={centerOnUser}>
              <Ionicons name="locate" size={18} color="#0f1115" />
              <Text style={styles.primaryButtonText}>My Position</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={exportWaypoints}>
              <Text style={styles.secondaryButtonText}>Share JSON</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerButton} onPress={clearWaypoints}>
              <Text style={styles.dangerButtonText}>Clear</Text>
            </TouchableOpacity>
          </View>
        </View>
        {loadingLocation && (
          <View style={styles.mapLoader}>
            <ActivityIndicator size="small" color="#4cd964" />
            <Text style={styles.mapLoaderText}>Acquiring GPS...</Text>
          </View>
        )}
      </View>
      <ScrollView style={styles.bottomSheet}>
        <SectionHeader
          title={`Stored Waypoints (${waypoints.length})`}
          actionLabel="Share"
          onAction={exportWaypoints}
        />
        {waypoints.length === 0 ? (
          <Text style={styles.emptyText}>Drop waypoints with a long press anywhere on the map.</Text>
        ) : (
          waypoints
            .slice()
            .reverse()
            .map(point => (
              <View key={point.id} style={styles.listCard}>
                <Text style={styles.cardTitle}>{point.name}</Text>
                <Text style={styles.cardSubtitle}>{new Date(point.timestamp).toLocaleString()}</Text>
                <Text style={styles.cardMeta}>
                  Lat {point.latitude.toFixed(5)} · Lon {point.longitude.toFixed(5)}
                </Text>
              </View>
            ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function FormsScreen() {
  const [activeForm, setActiveForm] = useState('nineLine');
  const [formState, setFormState] = useState({});
  const [entries, setEntries] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const stored = await readJson(FORMS_KEY, []);
      setEntries(stored);
    })();
  }, []);

  useEffect(() => {
    const initial = {};
    templateFields[activeForm].forEach(field => {
      initial[field.key] = '';
    });
    setFormState(initial);
  }, [activeForm]);

  const handleChange = (key, value) => {
    setFormState(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    const timestamp = new Date().toISOString();
    const entry = {
      id: `${Date.now()}`,
      type: activeForm,
      timestamp,
      payload: formState,
    };
    const updated = [entry, ...entries];
    setEntries(updated);
    await writeJson(FORMS_KEY, updated);
    setSaving(false);
    Alert.alert('Saved', `${activeForm === 'nineLine' ? '9-Line' : 'SALUTE'} entry cached.`);
  };

  const shareLatest = async () => {
    if (!entries.length) {
      Alert.alert('No entries yet');
      return;
    }
    const payload = JSON.stringify(entries[0], null, 2);
    try {
      await Share.share({ title: 'SORD QuickNote Form', message: payload });
    } catch (error) {
      Alert.alert('Share failed', error.message);
    }
  };

  const clearEntries = () => {
    Alert.alert('Clear all saved forms?', 'This removes every cached form entry.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear',
        style: 'destructive',
        onPress: () => {
          setEntries([]);
          writeJson(FORMS_KEY, []);
        },
      },
    ]);
  };

  const formTitle = activeForm === 'nineLine' ? '9-Line MEDEVAC' : 'SALUTE Report';

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.formsContainer}>
        <SectionHeader title="Report Type" />
        <View style={styles.segmentedControl}>
          <TouchableOpacity
            style={[styles.segmentButton, activeForm === 'nineLine' && styles.segmentButtonActive]}
            onPress={() => setActiveForm('nineLine')}
          >
            <Text style={[styles.segmentButtonText, activeForm === 'nineLine' && styles.segmentButtonTextActive]}>
              9-Line
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.segmentButton, activeForm === 'salute' && styles.segmentButtonActive]}
            onPress={() => setActiveForm('salute')}
          >
            <Text style={[styles.segmentButtonText, activeForm === 'salute' && styles.segmentButtonTextActive]}>
              SALUTE
            </Text>
          </TouchableOpacity>
        </View>
        <Divider />
        <Text style={styles.sectionSubtitle}>{formTitle}</Text>
        {templateFields[activeForm].map(field => (
          <View key={field.key} style={styles.inputBlock}>
            <Text style={styles.inputLabel}>{field.label}</Text>
            <TextInput
              style={styles.textInput}
              placeholder={field.placeholder}
              placeholderTextColor="#7b7e88"
              value={formState[field.key] || ''}
              onChangeText={text => handleChange(field.key, text)}
              multiline
            />
          </View>
        ))}
        <TouchableOpacity style={styles.primaryButton} onPress={handleSave} disabled={saving}>
          <Ionicons name="save" size={18} color="#0f1115" />
          <Text style={styles.primaryButtonText}>{saving ? 'Saving...' : 'Save Locally'}</Text>
        </TouchableOpacity>
        <View style={styles.formActionRow}>
          <TouchableOpacity style={styles.secondaryButton} onPress={shareLatest}>
            <Text style={styles.secondaryButtonText}>Share Latest</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dangerButton} onPress={clearEntries}>
            <Text style={styles.dangerButtonText}>Clear All</Text>
          </TouchableOpacity>
        </View>
        <Divider />
        <SectionHeader title={`Saved Entries (${entries.length})`} />
        {entries.length === 0 ? (
          <Text style={styles.emptyText}>Saved reports will live here for offline reference.</Text>
        ) : (
          entries.map(entry => (
            <View key={entry.id} style={styles.listCard}>
              <Text style={styles.cardTitle}>
                {entry.type === 'nineLine' ? '9-Line' : 'SALUTE'} · {new Date(entry.timestamp).toLocaleString()}
              </Text>
              <Text style={styles.cardMeta}>{Object.values(entry.payload).filter(Boolean).join(' | ') || 'No fields filled yet.'}</Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => Share.share({ title: 'SORD QuickNote Form', message: JSON.stringify(entry, null, 2) })}
              >
                <Text style={styles.secondaryButtonText}>Share</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BleScreen() {
  const [devices, setDevices] = useState({});
  const [history, setHistory] = useState([]);
  const [isScanning, setIsScanning] = useState(false);
  const [status, setStatus] = useState('Scanner idle');
  const managerRef = useRef(null);

  useEffect(() => {
    managerRef.current = new BleManager();
    (async () => {
      const stored = await readJson(BLE_HISTORY_KEY, []);
      setHistory(stored);
    })();
    return () => {
      managerRef.current?.stopDeviceScan();
      managerRef.current?.destroy();
    };
  }, []);

  const syncHistory = updated => {
    setHistory(updated);
    writeJson(BLE_HISTORY_KEY, updated);
  };

  const requestPermissions = async () => {
    if (Platform.OS !== 'android') {
      return true;
    }
    try {
      const result = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      ]);
      const granted = Object.values(result).every(value => value === PermissionsAndroid.RESULTS.GRANTED);
      if (!granted) {
        Alert.alert('Permissions required', 'Grant Bluetooth and Location to scan.');
      }
      return granted;
    } catch (error) {
      Alert.alert('Permission error', error.message);
      return false;
    }
  };

  const startScan = async () => {
    if (isScanning) {
      return;
    }
    const ok = await requestPermissions();
    if (!ok) {
      return;
    }
    setStatus('Scanning for BLE devices...');
    setIsScanning(true);
    const manager = managerRef.current;
    setDevices({});
    manager.startDeviceScan(null, null, (error, device) => {
      if (error) {
        setStatus(error.message);
        setIsScanning(false);
        manager.stopDeviceScan();
        return;
      }
      if (device) {
        setDevices(prev => {
          const next = { ...prev };
          next[device.id] = {
            id: device.id,
            name: device.name || 'Unknown',
            rssi: device.rssi,
            updatedAt: new Date().toISOString(),
          };
          syncHistory(
            Object.values(next)
              .sort((a, b) => (b.updatedAt > a.updatedAt ? 1 : -1))
              .slice(0, 100)
          );
          return next;
        });
      }
    });
  };

  const stopScan = () => {
    if (!isScanning) {
      return;
    }
    managerRef.current?.stopDeviceScan();
    setIsScanning(false);
    setStatus('Scanner idle');
  };

  const clearHistory = () => {
    managerRef.current?.stopDeviceScan();
    setIsScanning(false);
    setDevices({});
    syncHistory([]);
    setStatus('Scanner idle');
  };

  const shareHistory = async () => {
    if (!history.length) {
      Alert.alert('No scan history yet');
      return;
    }
    const payload = JSON.stringify({ devices: history }, null, 2);
    try {
      await Share.share({ title: 'SORD QuickNote BLE Devices', message: payload });
    } catch (error) {
      Alert.alert('Share failed', error.message);
    }
  };

  const deviceList = useMemo(() => Object.values(devices).sort((a, b) => (b.rssi ?? -200) - (a.rssi ?? -200)), [devices]);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.formsContainer}>
        <SectionHeader title="Bluetooth Scan" actionLabel="Share" onAction={shareHistory} />
        <Text style={styles.sectionSubtitle}>{status}</Text>
        <View style={styles.formActionRow}>
          <TouchableOpacity style={styles.primaryButton} onPress={startScan} disabled={isScanning}>
            <Ionicons name="bluetooth" size={18} color="#0f1115" />
            <Text style={styles.primaryButtonText}>{isScanning ? 'Scanning...' : 'Start Scan'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={stopScan}>
            <Text style={styles.secondaryButtonText}>Stop</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dangerButton} onPress={clearHistory}>
            <Text style={styles.dangerButtonText}>Clear</Text>
          </TouchableOpacity>
        </View>
        <Divider />
        <Text style={styles.sectionSubtitle}>Live Devices ({deviceList.length})</Text>
        {deviceList.length === 0 ? (
          <Text style={styles.emptyText}>Start a scan to populate nearby BLE devices and RSSI values.</Text>
        ) : (
          deviceList.map(device => (
            <View key={device.id} style={styles.listCard}>
              <Text style={styles.cardTitle}>{device.name}</Text>
              <Text style={styles.cardMeta}>RSSI: {device.rssi ?? 'N/A'} dBm</Text>
              <Text style={styles.cardSubtitle}>{device.id}</Text>
              <Text style={styles.cardMeta}>Last seen {new Date(device.updatedAt).toLocaleTimeString()}</Text>
            </View>
          ))
        )}
        <Divider />
        <SectionHeader title={`Cached History (${history.length})`} />
        {history.length === 0 ? (
          <Text style={styles.emptyText}>History retains up to 100 recently observed devices.</Text>
        ) : (
          history.map(item => (
            <View key={`${item.id}-${item.updatedAt}`} style={styles.listCard}>
              <Text style={styles.cardTitle}>{item.name}</Text>
              <Text style={styles.cardSubtitle}>{item.id}</Text>
              <Text style={styles.cardMeta}>
                RSSI {item.rssi ?? 'N/A'} dBm · {new Date(item.updatedAt).toLocaleString()}
              </Text>
            </View>
          ))
        )}
      </View>
    </SafeAreaView>
  );
}

function CameraScreen() {
  const [hasPermission, setHasPermission] = useState(null);
  const [notes, setNotes] = useState([]);
  const [note, setNote] = useState('');
  const cameraRef = useRef(null);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
      const stored = await readJson(PHOTO_NOTES_KEY, []);
      setNotes(stored);
    })();
  }, []);

  const cacheNotes = updated => {
    setNotes(updated);
    writeJson(PHOTO_NOTES_KEY, updated);
  };

  const capture = async () => {
    if (!cameraRef.current) {
      Alert.alert('Camera not ready');
      return;
    }
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.7 });
      const entry = {
        id: `${Date.now()}`,
        note: note.trim(),
        uri: photo.uri,
        timestamp: new Date().toISOString(),
      };
      const updated = [entry, ...notes];
      cacheNotes(updated);
      setNote('');
      Alert.alert('Saved', 'Photo note cached locally.');
    } catch (error) {
      Alert.alert('Capture failed', error.message);
    }
  };

  const shareEntry = async entry => {
    try {
      await Share.share({ title: 'SORD QuickNote Photo Note', message: JSON.stringify(entry, null, 2) });
    } catch (error) {
      Alert.alert('Share failed', error.message);
    }
  };

  if (hasPermission === null) {
    return (
      <SafeAreaView style={styles.screenCentered}>
        <ActivityIndicator color="#4cd964" />
        <Text style={styles.mapLoaderText}>Checking camera permission…</Text>
      </SafeAreaView>
    );
  }

  if (hasPermission === false) {
    return (
      <SafeAreaView style={styles.screenCentered}>
        <Text style={styles.emptyText}>
          Camera permission denied. Enable it in system settings to create photo notes.
        </Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.formsContainer}>
        <SectionHeader title="Capture" />
        <View style={styles.cameraWrapper}>
          <Camera ref={cameraRef} style={styles.camera} ratio="16:9" />
        </View>
        <TextInput
          style={styles.textInput}
          placeholder="Quick note (optional)"
          placeholderTextColor="#7b7e88"
          value={note}
          onChangeText={setNote}
        />
        <TouchableOpacity style={styles.primaryButton} onPress={capture}>
          <Ionicons name="camera" size={18} color="#0f1115" />
          <Text style={styles.primaryButtonText}>Capture</Text>
        </TouchableOpacity>
        <Divider />
        <SectionHeader title={`Stored Notes (${notes.length})`} />
        {notes.length === 0 ? (
          <Text style={styles.emptyText}>Capture an image to build your offline gallery.</Text>
        ) : (
          notes.map(entry => (
            <View key={entry.id} style={styles.listCard}>
              {entry.uri ? <Image source={{ uri: entry.uri }} style={styles.photoThumb} /> : null}
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{new Date(entry.timestamp).toLocaleString()}</Text>
                <Text style={styles.cardMeta}>{entry.note || 'No note supplied.'}</Text>
              </View>
              <TouchableOpacity style={styles.secondaryButton} onPress={() => shareEntry(entry)}>
                <Text style={styles.secondaryButtonText}>Share</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={appTheme}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: styles.tabBar,
          tabBarActiveTintColor: '#4cd964',
          tabBarInactiveTintColor: '#7b7e88',
          tabBarIcon: ({ color }) => {
            switch (route.name) {
              case 'Map':
                return <TabIcon name="map" color={color} />;
              case 'Reports':
                return <TabIcon name="clipboard" color={color} />;
              case 'BLE':
                return <TabIcon name="bluetooth" color={color} />;
              case 'Camera':
                return <TabIcon name="camera" color={color} />;
              default:
                return <TabIcon name="ellipse" color={color} />;
            }
          },
        })}
      >
        <Tab.Screen name="Map" component={MapScreen} />
        <Tab.Screen name="Reports" component={FormsScreen} />
        <Tab.Screen name="BLE" component={BleScreen} />
        <Tab.Screen name="Camera" component={CameraScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0f1115',
  },
  screenCentered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#0f1115',
  },
  mapContainer: {
    flex: 1,
  },
  mapOverlay: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(15,17,21,0.85)',
    padding: 12,
    borderWidth: 1,
    borderColor: '#1f2230',
  },
  mapStatus: {
    color: '#f4f6f9',
    marginBottom: 8,
    fontWeight: '600',
  },
  mapButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#4cd964',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
  },
  primaryButtonText: {
    color: '#0f1115',
    fontWeight: '700',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: '#4cd964',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  secondaryButtonText: {
    color: '#4cd964',
    fontWeight: '600',
  },
  dangerButton: {
    borderWidth: 1,
    borderColor: '#f75555',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  dangerButtonText: {
    color: '#f75555',
    fontWeight: '600',
  },
  mapLoader: {
    position: 'absolute',
    bottom: 24,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15,17,21,0.85)',
    padding: 12,
    borderRadius: 10,
    gap: 12,
  },
  mapLoaderText: {
    color: '#f4f6f9',
  },
  bottomSheet: {
    maxHeight: 240,
    backgroundColor: '#0f1115',
    borderTopWidth: 1,
    borderColor: '#1f2230',
    padding: 16,
  },
  listCard: {
    backgroundColor: '#161920',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#1f2230',
    flexDirection: 'row',
    gap: 12,
  },
  cardTitle: {
    color: '#f4f6f9',
    fontWeight: '700',
  },
  cardSubtitle: {
    color: '#c1c4cd',
    fontSize: 12,
    marginTop: 4,
  },
  cardMeta: {
    color: '#8b8f9c',
    fontSize: 12,
    marginTop: 4,
  },
  emptyText: {
    color: '#8b8f9c',
    marginTop: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#f4f6f9',
    fontSize: 18,
    fontWeight: '700',
  },
  sectionSubtitle: {
    color: '#c1c4cd',
    marginBottom: 12,
  },
  sectionAction: {
    color: '#4cd964',
    fontWeight: '600',
  },
  divider: {
    borderBottomWidth: 1,
    borderColor: '#1f2230',
    marginVertical: 16,
  },
  formsContainer: {
    padding: 16,
    gap: 12,
  },
  segmentedControl: {
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: '#1f2230',
    borderRadius: 12,
    overflow: 'hidden',
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: 'transparent',
  },
  segmentButtonActive: {
    backgroundColor: '#1f2230',
  },
  segmentButtonText: {
    textAlign: 'center',
    color: '#8b8f9c',
    fontWeight: '600',
  },
  segmentButtonTextActive: {
    color: '#4cd964',
  },
  inputBlock: {
    marginBottom: 12,
  },
  inputLabel: {
    color: '#c1c4cd',
    marginBottom: 6,
    fontWeight: '600',
  },
  textInput: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#1f2230',
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: '#f4f6f9',
    backgroundColor: '#161920',
  },
  formActionRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  tabBar: {
    backgroundColor: '#161920',
    borderTopColor: '#1f2230',
  },
  photoThumb: {
    width: 56,
    height: 56,
    borderRadius: 8,
  },
  cameraWrapper: {
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#1f2230',
    aspectRatio: 1,
    backgroundColor: '#050608',
  },
  camera: {
    flex: 1,
  },
});
