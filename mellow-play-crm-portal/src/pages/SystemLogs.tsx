import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { 
  Box, Typography, Paper, Button, Table, TableBody, TableCell, 
  TableContainer, TableHead, TableRow, Chip, TextField, 
  InputAdornment, MenuItem, Select, FormControl, InputLabel,
  Collapse, IconButton
} from '@mui/material';
import { 
  Warning as ShieldAlert, 
  DeleteOutline as Trash2, 
  Refresh as RefreshCw,
  Search as SearchIcon,
  KeyboardArrowDown,
  KeyboardArrowUp
} from '@mui/icons-material';
import { API_URL } from '../config';

export const SystemLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState('');
  const [levelFilter, setLevelFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('crm_token');
      const res = await axios.get(`${API_URL}/api/v1/system/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.data.success) {
        setLogs(res.data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch logs', err);
    } finally {
      setLoading(false);
    }
  };

  const clearLogs = async () => {
    if (!window.confirm('ยืนยันการลบ Log ที่เก่ากว่า 30 วัน?')) return;
    try {
      const token = localStorage.getItem('crm_token');
      await axios.delete(`${API_URL}/api/v1/system/logs`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchLogs();
    } catch (err) {
      console.error('Failed to clear logs', err);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const uniqueSources = useMemo(() => {
    const sources = new Set(logs.map(log => log.source));
    return Array.from(sources);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter(log => {
      const matchesSearch = 
        log.message?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.source?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        log.stack_trace?.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
      const matchesSource = sourceFilter === 'all' || log.source === sourceFilter;

      return matchesSearch && matchesLevel && matchesSource;
    });
  }, [logs, searchQuery, levelFilter, sourceFilter]);

  return (
    <Box sx={{ p: 3, maxWidth: 1200, margin: '0 auto' }}>
      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight="bold" color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ShieldAlert color="error" fontSize="large" />
              System Logs
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              ประวัติข้อผิดพลาดของระบบ (Error Logs)
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button 
              variant="outlined" 
              startIcon={<RefreshCw />} 
              onClick={fetchLogs}
              sx={{ borderRadius: 2 }}
            >
              รีเฟรช
            </Button>
            <Button 
              variant="contained" 
              color="error" 
              startIcon={<Trash2 />} 
              onClick={clearLogs}
              sx={{ borderRadius: 2 }}
            >
              ลบ Log เก่า (&gt;30 วัน)
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mt: 4, flexWrap: 'wrap' }}>
          <TextField
            placeholder="ค้นหาข้อความ, Source, หรือ Stack trace..."
            variant="outlined"
            size="small"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            sx={{ flexGrow: 1, minWidth: '300px' }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="action" />
                </InputAdornment>
              ),
            }}
          />
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>ระดับ (Level)</InputLabel>
            <Select
              value={levelFilter}
              label="ระดับ (Level)"
              onChange={(e) => setLevelFilter(e.target.value)}
            >
              <MenuItem value="all">ทั้งหมด</MenuItem>
              <MenuItem value="error">Error</MenuItem>
              <MenuItem value="warn">Warning</MenuItem>
              <MenuItem value="info">Info</MenuItem>
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>แหล่งที่มา (Source)</InputLabel>
            <Select
              value={sourceFilter}
              label="แหล่งที่มา (Source)"
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <MenuItem value="all">ทั้งหมด</MenuItem>
              {uniqueSources.map(source => (
                <MenuItem key={source} value={source}>{source}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ borderRadius: 3, border: '1px solid #e0e0e0', overflow: 'hidden' }}>
        <TableContainer>
          <Table>
            <TableHead sx={{ bgcolor: '#f8f9fa' }}>
              <TableRow>
                <TableCell width={50} />
                <TableCell width={180}>เวลา</TableCell>
                <TableCell width={100}>ระดับ</TableCell>
                <TableCell width={150}>แหล่งที่มา</TableCell>
                <TableCell>ข้อความ (Message)</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    กำลังโหลด...
                  </TableCell>
                </TableRow>
              ) : filteredLogs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 5, color: 'text.secondary' }}>
                    ไม่พบข้อมูล Log ที่ค้นหา
                  </TableCell>
                </TableRow>
              ) : (
                filteredLogs.map((log) => (
                  <React.Fragment key={log.id}>
                    <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
                      <TableCell>
                        {log.stack_trace && (
                          <IconButton size="small" onClick={() => toggleRow(log.id)}>
                            {expandedRows[log.id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell>{new Date(log.created_at + 'Z').toLocaleString('th-TH')}</TableCell>
                      <TableCell>
                        <Chip 
                          label={log.level.toUpperCase()} 
                          color={log.level === 'error' ? 'error' : log.level === 'warn' ? 'warning' : 'info'}
                          size="small"
                          sx={{ fontWeight: 'bold' }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip label={log.source} size="small" variant="outlined" />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" fontWeight="500">
                          {log.message}
                        </Typography>
                      </TableCell>
                    </TableRow>
                    {log.stack_trace && (
                      <TableRow>
                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={5}>
                          <Collapse in={expandedRows[log.id]} timeout="auto" unmountOnExit>
                            <Box sx={{ margin: 2, p: 2, bgcolor: '#1e1e1e', borderRadius: 2, overflowX: 'auto' }}>
                              <Typography variant="caption" sx={{ color: '#d4d4d4', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                {log.stack_trace}
                              </Typography>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  );
};
