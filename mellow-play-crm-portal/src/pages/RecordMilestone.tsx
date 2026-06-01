import { API_URL } from '../config';
import React, { useEffect, useState, useRef } from 'react';
import { 
  Typography, Box, CircularProgress, 
  Grid, Card, CardContent, Button, Divider, Chip,
  TextField, IconButton, Paper, Alert, AlertTitle
} from '@mui/material';
import { 
  ArrowBack as BackIcon,
  Save as SaveIcon,
  CloudUpload as UploadIcon,
  Image as ImageIcon,
  Movie as VideoIcon,
  Close as ClearIcon,
  Psychology as BrainIcon,
  Handshake as HandshakeIcon,
  PanTool as HandIcon,
  Lightbulb as LightbulbIcon
} from '@mui/icons-material';
import axios from 'axios';

const API_BASE = `${API_URL}/api/v1`;

interface RecordMilestoneProps {
  booking: any;
  onClose: () => void;
  onSuccess: () => void;
}

const RecordMilestone: React.FC<RecordMilestoneProps> = ({ booking, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    skills: [] as string[],
    teacherComment: '',
    images: [] as string[],
    videoUrl: ''
  });

  const availableSkills = [
    { id: 'problem_solving', label: 'การแก้ปัญหา', icon: <BrainIcon fontSize="small" /> },
    { id: 'collaboration', label: 'ความร่วมมือ', icon: <HandshakeIcon fontSize="small" /> },
    { id: 'motor_skills', label: 'พัฒนากล้ามเนื้อ', icon: <HandIcon fontSize="small" /> },
    { id: 'creativity', label: 'ความคิดสร้างสรรค์', icon: <LightbulbIcon fontSize="small" /> },
  ];

  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const toggleSkill = (skillLabel: string) => {
    const current = [...formData.skills];
    const index = current.indexOf(skillLabel);
    if (index > -1) current.splice(index, 1);
    else current.push(skillLabel);
    setFormData({ ...formData, skills: current });
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newImages = [...formData.images];
    for (let i = 0; i < files.length; i++) {
      newImages.push(URL.createObjectURL(files[i]));
    }
    setFormData({ ...formData, images: newImages });
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      await axios.post(`${API_BASE}/journey/record`, {
        childId: booking.child_id,
        bookingId: booking.id,
        skillsLearned: formData.skills,
        teacherComment: formData.teacherComment,
        media: [
          ...formData.images.map(url => ({ url, type: 'image' })),
          ...(formData.videoUrl ? [{ url: formData.videoUrl, type: 'video' }] : [])
        ]
      });
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Failed to submit report');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ pb: 10 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 4 }}>
        <IconButton onClick={onClose} sx={{ bgcolor: 'white', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
          <BackIcon />
        </IconButton>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 800 }}>บันทึกรายงานการเรียนรู้วันนี้</Typography>
          <Typography variant="body2" color="text.secondary">
            นักเรียน: {booking.child_name} • คลาส: {booking.course_name}
          </Typography>
        </Box>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} md={7}>
          <Paper sx={{ p: 4, borderRadius: 4, border: '1px solid #f1f3f9' }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>1. ทักษะที่ได้เรียนรู้ (Skills)</Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5, mb: 5 }}>
              {availableSkills.map(skill => (
                <Chip
                  key={skill.id}
                  icon={skill.icon}
                  label={skill.label}
                  onClick={() => toggleSkill(skill.label)}
                  color={formData.skills.includes(skill.label) ? "primary" : "default"}
                  variant={formData.skills.includes(skill.label) ? "filled" : "outlined"}
                  sx={{ py: 2.5, px: 1, borderRadius: 3, fontWeight: 700 }}
                />
              ))}
            </Box>

            <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>2. ความคิดเห็นจากคุณครู</Typography>
            <TextField
              multiline
              rows={6}
              fullWidth
              placeholder="เล่าบรรยากาศการเรียน และพัฒนาการของน้องในวันนี้..."
              value={formData.teacherComment}
              onChange={(e) => setFormData({ ...formData, teacherComment: e.target.value })}
            />
          </Paper>
        </Grid>

        <Grid item xs={12} md={5}>
          <Paper sx={{ p: 4, borderRadius: 4, border: '1px solid #f1f3f9' }}>
            <Typography variant="h6" sx={{ fontWeight: 800, mb: 3 }}>3. รูปภาพและวิดีโอประกอบ</Typography>
            
            <Grid container spacing={2} sx={{ mb: 3 }}>
              {/* Video Placeholder */}
              <Grid item xs={4}>
                <Box 
                  onClick={() => videoInputRef.current?.click()}
                  sx={{ 
                    aspectRatio: '1/1', 
                    borderRadius: 3, 
                    border: '2px dashed #e2e8f0', 
                    display: 'flex', 
                    flexDirection: 'column', 
                    alignItems: 'center', 
                    justifyContent: 'center',
                    cursor: 'pointer',
                    bgcolor: formData.videoUrl ? 'slate.900' : 'transparent',
                    overflow: 'hidden',
                    position: 'relative'
                  }}
                >
                  {formData.videoUrl ? (
                    <>
                      <video src={formData.videoUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <IconButton 
                        size="small"
                        onClick={(e) => { e.stopPropagation(); setFormData({...formData, videoUrl: ''}); }}
                        sx={{ position: 'absolute', top: 4, right: 4, bgcolor: 'rgba(0,0,0,0.4)', color: 'white', p: 0.5 }}
                      >
                        <ClearIcon sx={{ fontSize: 16 }} />
                      </IconButton>
                    </>
                  ) : (
                    <>
                      <VideoIcon color="disabled" sx={{ fontSize: 20 }} />
                      <Typography variant="caption" sx={{ fontWeight: 700, mt: 0.5, fontSize: '10px' }}>วิดีโอ</Typography>
                    </>
                  )}
                </Box>
              </Grid>

              {/* Images Grid */}
              <Grid item xs={8}>
                <Grid container spacing={1}>
                  {formData.images.map((img, idx) => (
                    <Grid item xs={3} key={idx}>
                      <Box sx={{ position: 'relative', pt: '100%', borderRadius: 2, overflow: 'hidden', border: '1px solid #eee' }}>
                        <img src={img} alt="" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                        <IconButton 
                          size="small"
                          onClick={() => {
                            const newImgs = [...formData.images];
                            newImgs.splice(idx, 1);
                            setFormData({...formData, images: newImgs});
                          }}
                          sx={{ position: 'absolute', top: 2, right: 2, bgcolor: 'rgba(255,255,255,0.8)', p: 0.25 }}
                        >
                          <ClearIcon sx={{ fontSize: 12 }} />
                        </IconButton>
                      </Box>
                    </Grid>
                  ))}
                  {formData.images.length < 8 && (
                    <Grid item xs={3}>
                      <Box 
                        onClick={() => imageInputRef.current?.click()}
                        sx={{ pt: '100%', position: 'relative', borderRadius: 2, border: '2px dashed #e2e8f0', cursor: 'pointer' }}
                      >
                        <Box sx={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <AddIcon color="disabled" sx={{ fontSize: 18 }} />
                        </Box>
                      </Box>
                    </Grid>
                  )}
                </Grid>
              </Grid>
            </Grid>

            <input type="file" hidden accept="image/*" multiple ref={imageInputRef} onChange={handleImageUpload} />
            <input type="file" hidden accept="video/*" ref={videoInputRef} onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) setFormData({ ...formData, videoUrl: URL.createObjectURL(file) });
            }} />
          </Paper>

          <Box sx={{ mt: 4, display: 'flex', gap: 2 }}>
            <Button 
              variant="contained" 
              fullWidth 
              size="large" 
              disabled={loading}
              onClick={handleSubmit}
              startIcon={loading ? <CircularProgress size={20} /> : <SaveIcon />}
              sx={{ py: 2, fontWeight: 800 }}
            >
              ส่งรายงานให้ผู้ปกครอง
            </Button>
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
};

export default RecordMilestone;
