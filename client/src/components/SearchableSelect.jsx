import React, { useState, useEffect, useRef } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

const SearchableSelect = ({ options, value, onChange, placeholder = "Select...", isMobile = false }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const wrapperRef = useRef(null);
    const inputRef = useRef(null);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Filter options
    const filteredOptions = options.filter(option =>
        option.label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const selectedOption = options.find(o => String(o.value) === String(value));

    const handleSelect = (option) => {
        onChange(option.value);
        setIsOpen(false);
        setSearchTerm('');
    };

    return (
        <div ref={wrapperRef} style={{ position: 'relative', width: '100%' }}>
            {/* Trigger / Display */}
            <div
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen && inputRef.current) {
                        setTimeout(() => inputRef.current.focus(), 0);
                    }
                }}
                style={{
                    padding: isMobile ? '4px 8px' : '8px 12px',
                    borderRadius: '8px',
                    border: '1px solid #ccc',
                    background: 'white',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    minHeight: isMobile ? '28px' : '38px',
                    fontSize: isMobile ? '10px' : 'inherit'
                }}
            >
                <span style={{ color: selectedOption ? '#333' : '#999', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <ChevronDown size={16} color="#666" />
            </div>

            {/* Dropdown */}
            {isOpen && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    background: 'white',
                    border: '1px solid #ddd',
                    borderRadius: '8px',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                    marginTop: '4px',
                    overflow: 'hidden'
                }}>
                    {/* Search Input */}
                    <div style={{ padding: '8px', borderBottom: '1px solid #eee', display: 'flex', alignItems: 'center' }}>
                        <Search size={14} color="#999" style={{ marginRight: '8px' }} />
                        <input
                            ref={inputRef}
                            type="text"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            placeholder="Buscar..."
                            style={{
                                border: 'none',
                                outline: 'none',
                                width: '100%',
                                fontSize: isMobile ? '11px' : '13px'
                            }}
                            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking input
                        />
                        {searchTerm && (
                            <X
                                size={14}
                                color="#999"
                                style={{ cursor: 'pointer' }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setSearchTerm('');
                                }}
                            />
                        )}
                    </div>

                    {/* Options List */}
                    <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(option => (
                                <div
                                    key={option.value}
                                    onClick={() => handleSelect(option)}
                                    style={{
                                        padding: isMobile ? '4px 8px' : '8px 12px',
                                        cursor: 'pointer',
                                        fontSize: isMobile ? '10px' : '13px',
                                        borderBottom: '1px solid #f9f9f9',
                                        background: String(option.value) === String(value) ? '#f0f9ff' : 'white',
                                        color: String(option.value) === String(value) ? '#0066cc' : '#333'
                                    }}
                                    onMouseEnter={(e) => e.currentTarget.style.background = '#f5f5f5'}
                                    onMouseLeave={(e) => e.currentTarget.style.background = String(option.value) === String(value) ? '#f0f9ff' : 'white'}
                                >
                                    {option.label}
                                </div>
                            ))
                        ) : (
                            <div style={{ padding: '12px', textAlign: 'center', color: '#999', fontSize: '13px' }}>
                                No se encontraron resultados.
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SearchableSelect;
