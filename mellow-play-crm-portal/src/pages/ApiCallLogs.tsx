import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Box, Typography, Paper, Button, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, Chip, TextField,
  InputAdornment, MenuItem, Select, FormControl, InputLabel,
  Collapse, IconButton, TablePagination,
} from '@mui/material';
import {
  Http as ApiIcon,
  DeleteOutline as Trash2,
  Refresh as RefreshCw,
  Search as SearchIcon,
  KeyboardArrowDown,
  KeyboardArrowUp,
} from '@mui/icons-material';
import { API_URL } from '../config';

const METHOD_COLORS: Record<string, 'success' | 'info' | 'warning' | 'error' | 'default'> = {
  GET: 'info', POST: 'success', PUT: 'warning', PATCH: 'warning', DELETE: 'error',
};

const CALLER_LABELS: Record<string, string> = { admin: 'CRM Staff', consumer: 'ผู้ใช้งาน', guest: 'ไม่ระบุตัวตน' };

export const ApiCallLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(50);

  const [pathSearch, setPathSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [callerFilter, setCallerFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('crm_token');
      const params: Record<string, string> = {
        limit: String(rowsPerPage),
        offset: String(page * rowsPerPage),
      };
      if (pathSearch.trim()) params.path = pathSearch.trim();
      if (methodFilter !== 'all') params.method = methodFilter;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (callerFilter !== 'all') params.callerType = callerFilter;

      const res = await axios.get(`${API_URL}/api/v1/system/api-logs`, {
        headers: { Authorization: `Bearer ${token}` },
        params,
      });
      if (res.data.success) {
        setLogs(res.data.logs);
        setTotal(res.data.total);
      }
    } catch (err) {
      console.error('Failed to fetch API call logs', err);
    } finally {
      setLoading(false);
    }
  }, [page, rowsPerPage, pathSearch, methodFilter, statusFilter, callerFilter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const clearLogs = async () => {
    if (!window.confirm('ยืนยันการลบ Log ที่เก่ากว่า 30 วัน?')) return;
    try {
      const token = localStorage.getItem('crm_token');
      await axios.delete(`${API_URL}/api/v1/system/api-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      fetchLogs();
    } catch (err) {
      console.error('Failed to clear API call logs', err);
    }
  };

  const toggleRow = (id: number) => setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));

  return (
    <Box sx={{ p: 3, maxWidth: 1300, margin: '0 auto' }}>
      <Paper elevation={0} sx={{ p: 3, mb: 3, borderRadius: 3, border: '1px solid #e0e0e0' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
          <Box>
            <Typography variant="h4" fontWeight="bold" color="text.primary" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <ApiIcon color="primary" fontSize="large" />
              API Call Logs
            </Typography>
            <Typography variant="body1" color="text.secondary" sx={{ mt: 1 }}>
              ประวัติการเรียก API ทั้งหมด (เก็บสูงสุด 30 วัน)
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button variant="outlined" startIcon={<RefreshCw />} onClick={() => fetchLogs()} sx={{ borderRadius: 2 }}>
              รีเฟรช
            </Button>
            <Button variant="contained" color="error" startIcon={<Trash2 />} onClick={clearLogs} sx={{ borderRadius: 2 }}>
              ลบ Log เก่า (&gt;30 วัน)
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, mt: 4, flexWrap: 'wrap' }}>
          <TextField
            placeholder="ค้นหา Path..."
            variant="outlined"
            size="small"
            value={pathSearch}
            onChange={(e) => { setPage(0); setPathSearch(e.target.value); }}
            sx={{ flexGrow: 1, minWidth: '260px' }}
            InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment> }}
          />
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Method</InputLabel>
            <Select value={methodFilter} label="Method" onChange={(e) => { setPage(0); setMethodFilter(e.target.value); }}>
              <MenuItem value="all">ทั้งหมด</MenuItem>
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <MenuItem key={m} value={m}>{m}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 130 }}>
            <InputLabel>Status</InputLabel>
            <Select value={statusFilter} label="Status" onChange={(e) => { setPage(0); setStatusFilter(e.target.value); }}>
              <MenuItem value="all">ทั้งหมด</MenuItem>
              {['200', '201', '400', '401', '403', '404', '500'].map(s => <MenuItem key={s} value={s}>{s}</MenuItem>)}
            </Select>
          </FormControl>
          <FormControl size="small" sx={{ minWidth: 150 }}>
            <InputLabel>ผู้เรียก</InputLabel>
            <Select value={callerFilter} label="ผู้เรียก" onChange={(e) => { setPage(0); setCallerFilter(e.target.value); }}>
              <MenuItem value="all">ทั้งหมด</MenuItem>
              <MenuItem value="admin">CRM Staff</MenuItem>
              <MenuItem value="consumer">ผู้ใช้งาน</MenuItem>
              <MenuItem value="guest">ไม่ระบุตัวตน</MenuItem>
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
                <TableCell width={170}>เวลา</TableCell>
                <TableCell width={90}>Method</TableCell>
                <TableCell>Path</TableCell>
                <TableCell width={90}>Status</TableCell>
                <TableCell width={90}>เวลาที่ใช้</TableCell>
                <TableCell width={130}>ผู้เรียก</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>กำลังโหลด...</TableCell></TableRow>
              ) : logs.length === 0 ? (
                <TableRow><TableCell colSpan={7} align="center" sx={{ py: 5, color: 'text.secondary' }}>ไม่พบข้อมูล Log</TableCell></TableRow>
              ) : (
                logs.map((log) => (
                  <React.Fragment key={log.id}>
                    <TableRow hover sx={{ '& > *': { borderBottom: 'unset' } }}>
                      <TableCell>
                        <IconButton size="small" onClick={() => toggleRow(log.id)}>
                          {expandedRows[log.id] ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
                        </IconButton>
                      </TableCell>
                      <TableCell>{new Date(log.created_at + 'Z').toLocaleString('th-TH')}</TableCell>
                      <TableCell>
                        <Chip label={log.method} color={METHOD_COLORS[log.method] || 'default'} size="small" sx={{ fontWeight: 'bold' }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{log.path}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={log.status_code ?? '-'}
                          size="small"
                          variant="outlined"
                          color={log.status_code >= 500 ? 'error' : log.status_code >= 400 ? 'warning' : 'success'}
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">{log.duration_ms != null ? `${log.duration_ms} ms` : '-'}</Typography>
                      </TableCell>
                      <TableCell>
                        <Chip label={CALLER_LABELS[log.caller_type] || log.caller_type || '-'} size="small" variant="outlined" />
                      </TableCell>
                    </TableRow>
                    {(log.request_body || log.response_body) && (
                      <TableRow>
                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                          <Collapse in={expandedRows[log.id]} timeout="auto" unmountOnExit>
                            <Box sx={{ margin: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                              {log.request_body && (
                                <Box sx={{ flex: '1 1 300px', p: 2, bgcolor: '#1e1e1e', borderRadius: 2, overflowX: 'auto' }}>
                                  <Typography variant="caption" sx={{ color: '#9cdcfe', fontWeight: 700, display: 'block', mb: 0.5 }}>Request Body</Typography>
                                  <Typography variant="caption" sx={{ color: '#d4d4d4', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                    {log.request_body}
                                  </Typography>
                                </Box>
                              )}
                              {log.response_body && (
                                <Box sx={{ flex: '1 1 300px', p: 2, bgcolor: '#1e1e1e', borderRadius: 2, overflowX: 'auto' }}>
                                  <Typography variant="caption" sx={{ color: '#ce9178', fontWeight: 700, display: 'block', mb: 0.5 }}>Response Body</Typography>
                                  <Typography variant="caption" sx={{ color: '#d4d4d4', fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
                                    {log.response_body}
                                  </Typography>
                                </Box>
                              )}
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
        <TablePagination
          component="div"
          count={total}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
          rowsPerPageOptions={[25, 50, 100, 200]}
          labelRowsPerPage="แถวต่อหน้า"
        />
      </Paper>
    </Box>
  );
};
