import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Mail, Shield, LogOut, Save, CheckCircle, AlertCircle, Eye, EyeOff, User, Lock, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import './Settings.css';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const Settings = () => {
  const { logout, currentUser, updateUserEmail, updateUserPassword } = useAuth();
  const navigate = useNavigate();

  // Settings for IMAP (Receipt Reading)
  const [imapSettings, setImapSettings] = useState({
    IMAP_USER: '',
    IMAP_PASSWORD: ''
  });

  // Settings for App Profile
  const [profileEmail, setProfileEmail] = useState(currentUser?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(true);
  const [savingImap, setSavingImap] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchImapSettings();
  }, []);

  const fetchImapSettings = async () => {
    try {
      const { data } = await axios.get(`${API_BASE_URL}/settings`);
      // If the email is the old one or empty, and we know they want j.a.blanca89@gmail.com, 
      // we can suggest or set it if data is empty. But better to just load what's in DB.
      setImapSettings(prev => ({ 
        ...prev, 
        IMAP_USER: data.IMAP_USER || '',
        IMAP_PASSWORD: data.IMAP_PASSWORD || ''
      }));
    } catch (error) {
      console.error('Error fetching IMAP settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveImap = async (e) => {
    e.preventDefault();
    setSavingImap(true);
    setMessage(null);
    try {
      await axios.post(`${API_BASE_URL}/settings`, { 
        settings: {
          IMAP_USER: imapSettings.IMAP_USER,
          IMAP_PASSWORD: imapSettings.IMAP_PASSWORD
        } 
      });
      setMessage({ type: 'success', text: 'Configuración de lectura de email guardada correctamente.' });
    } catch (error) {
      setMessage({ type: 'error', text: 'Error al guardar configuración del lector de email.' });
    } finally {
      setSavingImap(false);
    }
  };

  const handleUpdateProfile = async (e) => {
    e.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      return setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
    }

    setSavingProfile(true);
    setMessage(null);
    const promises = [];
    
    if (profileEmail !== currentUser.email) {
      promises.push(updateUserEmail(profileEmail));
    }
    if (newPassword) {
      promises.push(updateUserPassword(newPassword));
    }

    try {
      await Promise.all(promises);
      setMessage({ type: 'success', text: 'Perfil de acceso actualizado correctamente.' });
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      console.error(error);
      setMessage({ type: 'error', text: 'Error al actualizar perfil. Si ha pasado mucho tiempo desde tu login, por favor cierra sesión y vuelve a entrar por seguridad.' });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full p-10">
        <div className="spinner" style={{ borderTopColor: '#4f46e5', width: '40px', height: '40px' }}></div>
      </div>
    );
  }

  return (
    <div className="settings-container">
      <div className="settings-header">
        <div className="settings-title-group">
          <h1>Cuentas y Configuración</h1>
          <p className="settings-subtitle">Gestiona tu identidad y el sistema de lectura automática de facturas.</p>
        </div>
        <button onClick={handleLogout} className="logout-btn">
          <LogOut size={20} />
          Cerrar Sesión
        </button>
      </div>

      {message && (
        <div className={`status-message ${message.type}`}>
          {message.type === 'success' ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
          <p>{message.text}</p>
        </div>
      )}

      <div className="settings-grid">
        
        {/* Section: App Profile Authentication */}
        <div className="settings-card indigo">
          <div className="card-header">
            <div className="icon-box indigo">
              <User size={28} />
            </div>
            <div className="card-header-text">
              <h2>Perfil de Acceso</h2>
              <p>Credenciales que usas para entrar en la aplicación.</p>
            </div>
          </div>

          <form onSubmit={handleUpdateProfile} className="card-body">
            <div className="form-group">
              <label>Email de Acceso</label>
              <div className="input-wrapper">
                <Mail size={20} />
                <input
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  placeholder="Tu email de acceso"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Nueva Contraseña</label>
              <div className="input-wrapper">
                <Lock size={20} />
                <input
                  type={showPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Dejar vacio para no cambiar"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="password-toggle"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>

            {newPassword && (
              <div className="form-group slide-in">
                <label>Confirmar Nueva Contraseña</label>
                <div className="input-wrapper">
                  <Lock size={20} />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
              </div>
            )}

            <button type="submit" disabled={savingProfile} className="save-btn indigo">
              {savingProfile ? <div className="spinner"></div> : <Save size={20} />}
              Actualizar Perfil de Acceso
            </button>
          </form>
        </div>

        {/* Section: Email Reader (IMAP) */}
        <div className="settings-card blue">
          <div className="card-header">
            <div className="icon-box blue">
              <Mail size={28} />
            </div>
            <div className="card-header-text">
              <h2>Escáner de Gastos (IA)</h2>
              <p>Email donde recibes facturas y justificantes.</p>
            </div>
          </div>

          <form onSubmit={handleSaveImap} className="card-body">
            <div className="info-alert">
              <Info size={20} className="shrink-0" />
              <p>
                <strong>¿Diferente cuenta?</strong> Este email es el que la IA leerá (ej: j.a.blanca89@gmail.com). Puede ser distinto a tu email de acceso de arriba.
              </p>
            </div>

            <div className="form-group">
              <label>Email de Recepción de Gastos</label>
              <div className="input-wrapper">
                <Mail size={20} />
                <input
                  type="email"
                  value={imapSettings.IMAP_USER}
                  onChange={(e) => setImapSettings({ ...imapSettings, IMAP_USER: e.target.value })}
                  placeholder="j.a.blanca89@gmail.com"
                  required
                />
              </div>
            </div>

            <div className="form-group">
              <label>Contraseña de Aplicación IMAP</label>
              <div className="input-wrapper">
                <Lock size={20} />
                <input
                  type="password"
                  value={imapSettings.IMAP_PASSWORD}
                  onChange={(e) => setImapSettings({ ...imapSettings, IMAP_PASSWORD: e.target.value })}
                  placeholder="xxxx xxxx xxxx xxxx"
                  required
                />
              </div>
            </div>

            <button type="submit" disabled={savingImap} className="save-btn blue">
              {savingImap ? <div className="spinner"></div> : <Save size={20} />}
              Guardar Configuración Lector
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;
