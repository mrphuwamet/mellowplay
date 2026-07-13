import React, { useEffect, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography,
  Box, CircularProgress, Paper, Chip, IconButton, Stack, Grid
} from '@mui/material';
import { Close as CloseIcon, Image as ImageIcon, Movie as VideoIcon, HistoryEdu as HistoryIcon } from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1`;

interface MediaItem {
  url: string;
  type: string;
}

interface JourneyProgress {
  id: number;
  child_id: number;
  node_id: number;
  booking_id?: number;
  skills_learned: string; // JSON array string or comma separated
  teacher_comment: string;
  completed_at: string;
  media?: MediaItem[];
  node_title?: string;
  node_desc?: string;
}

interface ChildJourneyDialogProps {
  open: boolean;
  onClose: () => void;
  childId: number | null;
  childName: string;
}

export const ChildJourneyDialog: React.FC<ChildJourneyDialogProps> = ({ open, onClose, childId, childName }) => {
  const [loading, setLoading] = useState(false);
  const [progressList, setProgressList] = useState<JourneyProgress[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && childId) {
      fetchProgress();
    }
  }, [open, childId]);

  const fetchProgress = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`${API_BASE}/journey/progress/${childId}`);
      if (res.data.success) {
        setProgressList(res.data.progress);
      } else {
        setError('ไม่สามารถดึงข้อมูลได้');
      }
    } catch (e: any) {
      setError(e.response?.data?.message || 'เกิดข้อผิดพลาดในการโหลดประวัติการเรียน');
    } finally {
      setLoading(false);
    }
  };

  const getSkills = (skillsStr: string): string[] => {
    if (!skillsStr) return [];
    try {
      const parsed = JSON.parse(skillsStr);
      if (Array.isArray(parsed)) return parsed;
      return [parsed];
    } catch {
      return typeof skillsStr === 'string' ? skillsStr.split(',').map(s => s.trim()) : [];
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <HistoryIcon color="primary" />
          <Typography variant="h6" sx={{ fontWeight: 800 }}>ประวัติการเรียน: {childName}</Typography>
        </Box>
        <IconButton onClick={onClose} size="small"><CloseIcon /></IconButton>
      </DialogTitle>
      
      <DialogContent dividers sx={{ bgcolor: '#fbfaf7' }}>
        {loading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 5 }}><CircularProgress /></Box>
        ) : error ? (
          <Typography color="error" textAlign="center" sx={{ p: 3 }}>{error}</Typography>
        ) : progressList.length === 0 ? (
          <Box sx={{ textAlign: 'center', p: 5 }}>
            <Typography color="text.secondary">ยังไม่มีประวัติการเรียนสำหรับเด็กคนนี้</Typography>
          </Box>
        ) : (
          <Stack spacing={3} sx={{ py: 2 }}>
            {progressList.map((item) => {
              const dateObj = new Date(item.completed_at);
              const dateStr = dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' });
              const timeStr = dateObj.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
              const skills = getSkills(item.skills_learned);
              
              return (
                <Paper key={item.id} sx={{ p: 3, borderRadius: 3, position: 'relative', overflow: 'hidden' }}>
                  <Box sx={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '6px', bgcolor: 'primary.main' }} />
                  
                  <Grid container spacing={3}>
                    <Grid item xs={12} md={7}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
                        <Typography variant="subtitle2" color="primary.main" sx={{ fontWeight: 800 }}>
                          {dateStr} เวลา {timeStr} น.
                        </Typography>
                      </Box>
                      
                      <Typography variant="h6" sx={{ fontWeight: 800, mb: 1 }}>{item.node_title || 'กิจกรรมพัฒนาทักษะ'}</Typography>
                      
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1, mb: 3 }}>
                        {skills.map((skill, idx) => (
                          <Chip key={idx} label={skill} size="small" color="secondary" variant="outlined" sx={{ fontWeight: 700 }} />
                        ))}
                      </Box>
                      
                      <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 2 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700, mb: 0.5, display: 'block' }}>
                          ความคิดเห็นจากคุณครู:
                        </Typography>
                        <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
                          {item.teacher_comment || '-'}
                        </Typography>
                      </Box>
                    </Grid>
                    
                    <Grid item xs={12} md={5}>
                      {item.media && item.media.length > 0 ? (
                        <Grid container spacing={1}>
                          {item.media.map((m, idx) => (
                            <Grid item xs={6} key={idx}>
                              <Box sx={{ position: 'relative', pt: '100%', borderRadius: 2, overflow: 'hidden', border: '1px solid #eee' }}>
                                {m.type === 'video' ? (
                                  <Box sx={{ position: 'absolute', inset: 0, bgcolor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.7 }} />
                                    <VideoIcon sx={{ color: 'white', position: 'absolute' }} />
                                  </Box>
                                ) : (
                                  <img src={m.url} alt="Activity" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                                )}
                              </Box>
                            </Grid>
                          ))}
                        </Grid>
                      ) : (
                        <Box sx={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', bgcolor: '#f9f9f9', borderRadius: 2, minHeight: 120 }}>
                          <Typography variant="body2" color="text.disabled">ไม่มีรูปภาพ/วิดีโอ</Typography>
                        </Box>
                      )}
                    </Grid>
                  </Grid>
                </Paper>
              );
            })}
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="outlined" sx={{ fontWeight: 700, borderRadius: 2 }}>ปิดหน้าต่าง</Button>
      </DialogActions>
    </Dialog>
  );
};
