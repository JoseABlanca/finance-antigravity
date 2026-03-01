import React, { useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Link } from 'react-router-dom';
import './Auth.css';

export default function ForgotPassword() {
    const emailRef = useRef();
    const { resetPassword } = useAuth();
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e) {
        e.preventDefault();

        try {
            setMessage('');
            setError('');
            setLoading(true);
            await resetPassword(emailRef.current.value);
            setMessage('Check your inbox for further instructions. You can close this page.');
        } catch (err) {
            console.error(err);
            setError('Failed to reset password: ' + err.message);
        }
    }

    return (
        <div className="auth-container">
            <div className="auth-card">
                <h2 className="auth-title">Password Reset</h2>
                {error && <div className="auth-error">{error}</div>}
                {message && <div style={{ backgroundColor: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', padding: '0.75rem', borderRadius: '6px', marginBottom: '1.5rem', textAlign: 'center', fontSize: '0.9rem', border: '1px solid rgba(34, 197, 94, 0.2)' }}>{message}</div>}
                <form onSubmit={handleSubmit} className="auth-form">
                    <div className="form-group">
                        <label>Email</label>
                        <input type="email" ref={emailRef} required />
                    </div>
                    <button disabled={loading} className="auth-button" type="submit">
                        Reset Password
                    </button>
                </form>
                <div className="auth-links">
                    <Link to="/login">Login</Link>
                </div>
                <div className="auth-links">
                    Need an account? <Link to="/register">Sign Up</Link>
                </div>
            </div>
        </div>
    );
}
