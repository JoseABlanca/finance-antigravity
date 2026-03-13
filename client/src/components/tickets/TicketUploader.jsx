import React, { useState, useRef } from 'react';
import axios from 'axios';
import { Upload, Camera, AlertCircle, Loader, CheckCircle2 } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const TicketUploader = ({ onSuccess }) => {
    const [file, setFile] = useState(null);
    const [preview, setPreview] = useState(null);
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState(null);
    const [success, setSuccess] = useState(false);
    const fileInputRef = useRef(null);
    const cameraInputRef = useRef(null);

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (!selectedFile) return;

        // Reset states
        setError(null);
        setSuccess(false);

        // Validate type
        if (!selectedFile.type.startsWith('image/') && selectedFile.type !== 'application/pdf') {
            setError('Por favor, sube una imagen (Foto del ticket) o un PDF.');
            return;
        }

        setFile(selectedFile);
        
        // Create preview just for display
        if (selectedFile.type.startsWith('image/')) {
            const objectUrl = URL.createObjectURL(selectedFile);
            setPreview(objectUrl);
        } else {
            setPreview(null);
        }
    };

    const handleUpload = async () => {
        if (!file) {
            setError('Selecciona un archivo primero');
            return;
        }

        setIsUploading(true);
        setError(null);

        const formData = new FormData();
        formData.append('receipt', file);

        try {
            const response = await axios.post(`${API_URL}/bi/tickets/upload`, formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });

            console.log('Ticket procesado:', response.data);
            setSuccess(true);
            
            // Notify parent to switch tabs/refresh data
            if (onSuccess) {
                setTimeout(() => onSuccess(), 1500);
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error || 'Error al procesar el ticket con Inteligencia Artificial. Asegúrate de tener GEMINI_API_KEY configurada.');
        } finally {
            setIsUploading(false);
        }
    };

    return (
        <div className="ticket-uploader" style={{ maxWidth: '600px', margin: '0 auto' }}>
            <h3 style={{ marginBottom: '16px', color: 'var(--text-main)' }}>Escanear Nuevo Ticket</h3>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '24px' }}>
                Haz una foto a tu ticket de compra o sube un archivo. La inteligencia artificial extraerá todos los artículos, cantidades y precios automáticamente.
            </p>

            {/* Selection Zone */}
            <div 
                style={{
                    border: '2px dashed var(--border)',
                    borderRadius: '12px',
                    padding: preview ? '20px' : '40px 20px',
                    textAlign: 'center',
                    backgroundColor: 'var(--surface-hover)',
                    marginBottom: '24px',
                    transition: 'all 0.2s',
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                {preview ? (
                    <div style={{ position: 'relative' }}>
                        <img src={preview} alt="Preview" style={{ maxHeight: '300px', maxWidth: '100%', objectFit: 'contain', borderRadius: '8px' }} />
                        <button 
                            onClick={() => { setFile(null); setPreview(null); }}
                            className="btn btn-outline"
                            style={{ position: 'absolute', top: '10px', right: '10px', padding: '6px 12px', background: 'rgba(255,255,255,0.9)', color: '#333' }}
                        >
                            Cambiar
                        </button>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <button 
                                className="btn btn-primary"
                                onClick={() => cameraInputRef.current?.click()}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '24px', minWidth: '140px' }}
                            >
                                <Camera size={32} />
                                <span>Hacer Foto</span>
                            </button>
                            
                            <button 
                                className="btn btn-outline"
                                onClick={() => fileInputRef.current?.click()}
                                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', padding: '24px', minWidth: '140px', background: 'var(--bg-card)' }}
                            >
                                <Upload size={32} />
                                <span>Adjuntar Archivo</span>
                            </button>
                        </div>
                        <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Soporta JPG, PNG, HEIC y PDF</span>
                    </div>
                )}
                
                {/* Hidden Inputs */}
                <input 
                    type="file" 
                    ref={cameraInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*"
                    capture="environment"
                    style={{ display: 'none' }} 
                />
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*,application/pdf"
                    style={{ display: 'none' }} 
                />
            </div>

            {/* Error Message */}
            {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #f87171', color: '#b91c1c', padding: '12px', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <AlertCircle size={20} />
                    <span>{error}</span>
                </div>
            )}

            {/* Success Message */}
            {success && (
                <div style={{ background: '#f0fdf4', border: '1px solid #4ade80', color: '#15803d', padding: '12px', borderRadius: '8px', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle2 size={20} />
                    <span>¡Ticket procesado con éxito! Redirigiendo...</span>
                </div>
            )}

            {/* Action Area */}
            <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button 
                    className="btn btn-primary" 
                    onClick={handleUpload}
                    disabled={!file || isUploading || success}
                    style={{ 
                        width: '100%', 
                        padding: '16px', 
                        fontSize: '16px', 
                        display: 'flex', 
                        justifyContent: 'center', 
                        gap: '8px',
                        opacity: !file ? 0.6 : 1
                    }}
                >
                    {isUploading ? (
                        <><Loader className="spin" size={20} /> Leyendo Ticket con IA (Gemini)...</>
                    ) : success ? (
                        <><CheckCircle2 size={20} /> Finalizado</>
                    ) : (
                        <><Upload size={20} /> Enviar y Analizar Ticket</>
                    )}
                </button>
            </div>
            
        </div>
    );
};

export default TicketUploader;
