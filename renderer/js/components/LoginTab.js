// LoginTab Component
function LoginTab({ onLogin }) {
    const { useState } = React;
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        // Hardcoded credentials
        const validEmail = 'pratik123@skystar.co.in';
        const validPassword = 'Pratik123@';

        // Simulate login delay for better UX
        setTimeout(() => {
            if (email.trim() === validEmail && password === validPassword) {
                // Store login state
                localStorage.setItem('isLoggedIn', 'true');
                localStorage.setItem('userEmail', email);
                
                // Call onLogin callback to show main app
                if (onLogin) {
                    onLogin();
                }
            } else {
                setError('Invalid email or password. Please try again.');
                setIsLoading(false);
            }
        }, 500);
    };

    return (
        <div style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #00BFFF 0%, #10b981 50%, #ffffff 100%)',
            backgroundSize: '200% 200%',
            animation: 'gradientShift 15s ease infinite',
            padding: '24px'
        }}>
            <div style={{
                width: '100%',
                maxWidth: '420px',
                background: 'rgba(255, 255, 255, 0.95)',
                backdropFilter: 'blur(20px) saturate(180%)',
                WebkitBackdropFilter: 'blur(20px) saturate(180%)',
                borderRadius: '24px',
                boxShadow: '0 8px 32px rgba(0, 0, 0, 0.16)',
                border: '1px solid rgba(255, 255, 255, 0.18)',
                padding: '40px',
                animation: 'fadeInUp 0.5s ease'
            }}>
                {/* Logo */}
                <div style={{
                    textAlign: 'center',
                    marginBottom: '32px'
                }}>
                    <div style={{
                        display: 'inline-block',
                        marginBottom: '16px'
                    }}>
                        <svg viewBox="0 0 100 100" style={{width: '80px', height: '80px'}} xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="loginLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stopColor="#10b981" stopOpacity="1" />
                                    <stop offset="100%" stopColor="#059669" stopOpacity="1" />
                                </linearGradient>
                                <radialGradient id="loginGlowGrad" cx="50%" cy="50%">
                                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.8" />
                                    <stop offset="50%" stopColor="#ffffff" stopOpacity="0.4" />
                                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                                </radialGradient>
                                <radialGradient id="loginWhiteGlow" cx="75%" cy="50%">
                                    <stop offset="0%" stopColor="#ffffff" stopOpacity={1} />
                                    <stop offset="40%" stopColor="#ffffff" stopOpacity="0.9" />
                                    <stop offset="100%" stopColor="#e5f9f0" stopOpacity="0.6" />
                                </radialGradient>
                            </defs>
                            <rect x="20" y="20" width="60" height="60" rx="12" fill="url(#loginLogoGrad)"/>
                            <rect x="20" y="20" width="60" height="60" rx="12" fill="none" stroke="#34d399" strokeWidth="0.5" opacity="0.3"/>
                            <circle cx="50" cy="50" r="20" fill="none"/>
                            <path d="M 50 30 A 20 20 0 0 1 50 70 L 50 50 Z" fill="#059669" opacity="0.7"/>
                            <path d="M 50 30 A 20 20 0 0 0 50 70 L 50 50 Z" fill="url(#loginWhiteGlow)"/>
                            <circle cx="50" cy="50" r="10" fill="url(#loginGlowGrad)" opacity="0.6"/>
                            <ellipse cx="60" cy="50" rx="8" ry="12" fill="#ffffff" opacity="0.9"/>
                        </svg>
                    </div>
                    <h1 style={{
                        fontSize: '32px',
                        fontWeight: '700',
                        background: 'linear-gradient(135deg, #10b981 0%, #00BFFF 100%)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                        marginBottom: '8px'
                    }}>
                        Wapiea
                    </h1>
                    <p style={{
                        color: '#6b7280',
                        fontSize: '14px',
                        fontWeight: '500'
                    }}>
                        WhatsApp Marketing Automation
                    </p>
                </div>

                {/* Login Form */}
                <form onSubmit={handleSubmit}>
                    {error && (
                        <div style={{
                            padding: '12px 16px',
                            background: 'rgba(239, 68, 68, 0.1)',
                            border: '2px solid rgba(239, 68, 68, 0.3)',
                            borderRadius: '12px',
                            color: '#dc2626',
                            marginBottom: '20px',
                            fontSize: '14px',
                            fontWeight: '500',
                            animation: 'shake 0.5s ease'
                        }}>
                            ⚠️ {error}
                        </div>
                    )}

                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            color: '#1a1a2e',
                            fontWeight: '600',
                            fontSize: '14px'
                        }}>
                            Email Address
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="Enter your email"
                            required
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                border: '2px solid rgba(16, 185, 129, 0.2)',
                                borderRadius: '12px',
                                fontSize: '15px',
                                transition: 'all 0.3s ease',
                                background: 'rgba(255, 255, 255, 0.9)',
                                color: '#1a1a2e',
                                outline: 'none'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#10b981';
                                e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(16, 185, 129, 0.2)';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: '24px' }}>
                        <label style={{
                            display: 'block',
                            marginBottom: '8px',
                            color: '#1a1a2e',
                            fontWeight: '600',
                            fontSize: '14px'
                        }}>
                            Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Enter your password"
                            required
                            disabled={isLoading}
                            style={{
                                width: '100%',
                                padding: '14px 16px',
                                border: '2px solid rgba(16, 185, 129, 0.2)',
                                borderRadius: '12px',
                                fontSize: '15px',
                                transition: 'all 0.3s ease',
                                background: 'rgba(255, 255, 255, 0.9)',
                                color: '#1a1a2e',
                                outline: 'none'
                            }}
                            onFocus={(e) => {
                                e.target.style.borderColor = '#10b981';
                                e.target.style.boxShadow = '0 0 0 3px rgba(16, 185, 129, 0.1)';
                            }}
                            onBlur={(e) => {
                                e.target.style.borderColor = 'rgba(16, 185, 129, 0.2)';
                                e.target.style.boxShadow = 'none';
                            }}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        style={{
                            width: '100%',
                            padding: '14px 24px',
                            background: isLoading 
                                ? 'linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)'
                                : 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: '12px',
                            fontSize: '16px',
                            fontWeight: '600',
                            cursor: isLoading ? 'not-allowed' : 'pointer',
                            transition: 'all 0.3s ease',
                            boxShadow: isLoading 
                                ? 'none'
                                : '0 4px 16px rgba(16, 185, 129, 0.3)',
                            transform: isLoading ? 'scale(0.98)' : 'scale(1)'
                        }}
                        onMouseEnter={(e) => {
                            if (!isLoading) {
                                e.target.style.transform = 'scale(1.02)';
                                e.target.style.boxShadow = '0 6px 20px rgba(16, 185, 129, 0.4)';
                            }
                        }}
                        onMouseLeave={(e) => {
                            if (!isLoading) {
                                e.target.style.transform = 'scale(1)';
                                e.target.style.boxShadow = '0 4px 16px rgba(16, 185, 129, 0.3)';
                            }
                        }}
                    >
                        {isLoading ? (
                            <span>🔄 Logging in...</span>
                        ) : (
                            <span>🔐 Login</span>
                        )}
                    </button>
                </form>

                {/* Footer */}
                <div style={{
                    marginTop: '24px',
                    textAlign: 'center',
                    color: '#9ca3af',
                    fontSize: '12px'
                }}>
                    <p>Secure Login • Wapiea Platform</p>
                </div>
            </div>
        </div>
    );
}

