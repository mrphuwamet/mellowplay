import React, { useEffect, useState } from 'react';
import {
  Box, Typography, Paper, Button, Chip, CircularProgress, Alert,
  Dialog, DialogTitle, DialogContent, DialogActions, Stack, Divider,
} from '@mui/material';
import {
  Flag as ReportIcon, VisibilityOff as HideIcon, Visibility as UnhideIcon,
  Delete as DeleteIcon, Close as DismissIcon, Image as ImageIcon,
} from '@mui/icons-material';
import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/api/v1/admin`;

const getImageUrl = (url?: string | null) => {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('blob:')) return url;
  return `${API_URL}${url.startsWith('/') ? '' : '/'}${url}`;
};

interface Report {
  id: number;
  reason: string | null;
  created_at: string;
  reporter_name: string;
}

interface ReportedPost {
  id: number;
  content: string;
  image_url: string | null;
  is_hidden: boolean;
  created_at: string;
  author_user_id: number;
  author_name: string;
  report_count: number;
  reports: Report[];
}

// Report-then-review moderation (per 2026-07-24 product decision) — a post
// stays live the moment it's posted; this page is where staff review posts
// members have flagged and decide whether to hide or delete them. Posts with
// no pending reports don't appear here at all.
const CommunityModeration = () => {
  const [posts, setPosts] = useState<ReportedPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actioningId, setActioningId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReportedPost | null>(null);

  const fetchReported = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data } = await axios.get(`${API_BASE}/community/reported-posts`);
      if (data.success) setPosts(data.posts);
      else setError(data.message || 'โหลดข้อมูลไม่สำเร็จ');
    } catch (e: any) {
      setError(e.response?.data?.message || 'โหลดข้อมูลไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchReported(); }, []);

  const runAction = async (postId: number, action: 'hide' | 'unhide' | 'dismiss-reports', method: 'post' = 'post') => {
    setActioningId(postId);
    try {
      await axios[method](`${API_BASE}/community/posts/${postId}/${action}`);
      await fetchReported();
    } catch (e: any) {
      setError(e.response?.data?.message || 'ดำเนินการไม่สำเร็จ');
    } finally {
      setActioningId(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setActioningId(deleteTarget.id);
    try {
      await axios.delete(`${API_BASE}/community/posts/${deleteTarget.id}`);
      setDeleteTarget(null);
      await fetchReported();
    } catch (e: any) {
      setError(e.response?.data?.message || 'ลบไม่สำเร็จ');
    } finally {
      setActioningId(null);
    }
  };

  if (loading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 10 }}><CircularProgress /></Box>;

  return (
    <Box>
      <Typography variant="h5" sx={{ fontWeight: 800, mb: 1 }}>ตรวจสอบโพสต์ที่ถูกรายงาน</Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
        โพสต์จะยังแสดงในฟีดตามปกติจนกว่าจะถูกซ่อนหรือลบ — การรายงานเพียงอย่างเดียวไม่ได้ซ่อนโพสต์โดยอัตโนมัติ
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {posts.length === 0 ? (
        <Paper sx={{ p: 6, borderRadius: 3, textAlign: 'center' }}>
          <ReportIcon sx={{ fontSize: 40, color: 'text.disabled', mb: 1 }} />
          <Typography color="text.secondary">ไม่มีโพสต์ที่ถูกรายงานในขณะนี้</Typography>
        </Paper>
      ) : (
        <Stack spacing={2}>
          {posts.map(post => (
            <Paper key={post.id} sx={{ p: 3, borderRadius: 3, border: '1px solid #e5e7eb' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 2, mb: 1.5 }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>{post.author_name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(post.created_at).toLocaleString('th-TH')}
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1}>
                  <Chip icon={<ReportIcon sx={{ fontSize: '14px !important' }} />} label={`ถูกรายงาน ${post.report_count} ครั้ง`} size="small" color="error" sx={{ fontWeight: 700 }} />
                  {post.is_hidden && <Chip label="ซ่อนอยู่" size="small" color="default" sx={{ fontWeight: 700 }} />}
                </Stack>
              </Box>

              <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap', mb: post.image_url ? 1.5 : 2 }}>{post.content}</Typography>
              {post.image_url && (
                <Box sx={{ mb: 2, borderRadius: 2, overflow: 'hidden', maxWidth: 320, bgcolor: '#f8fafc' }}>
                  <img src={getImageUrl(post.image_url)} alt="" style={{ width: '100%', display: 'block' }} />
                </Box>
              )}

              <Divider sx={{ my: 1.5 }} />

              <Typography variant="caption" sx={{ fontWeight: 800, color: 'text.secondary', display: 'block', mb: 1 }}>
                เหตุผลการรายงาน
              </Typography>
              <Stack spacing={0.75} sx={{ mb: 2 }}>
                {post.reports.map(r => (
                  <Box key={r.id} sx={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem' }}>
                    <Typography variant="body2">
                      <strong>{r.reporter_name}</strong>{r.reason ? ` — ${r.reason}` : ''}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">{new Date(r.created_at).toLocaleDateString('th-TH')}</Typography>
                  </Box>
                ))}
              </Stack>

              <Stack direction="row" spacing={1.5}>
                {post.is_hidden ? (
                  <Button
                    size="small" variant="outlined" startIcon={<UnhideIcon />}
                    disabled={actioningId === post.id}
                    onClick={() => runAction(post.id, 'unhide')}
                  >
                    เลิกซ่อนโพสต์
                  </Button>
                ) : (
                  <Button
                    size="small" variant="outlined" color="warning" startIcon={<HideIcon />}
                    disabled={actioningId === post.id}
                    onClick={() => runAction(post.id, 'hide')}
                  >
                    ซ่อนโพสต์
                  </Button>
                )}
                <Button
                  size="small" variant="outlined" color="error" startIcon={<DeleteIcon />}
                  disabled={actioningId === post.id}
                  onClick={() => setDeleteTarget(post)}
                >
                  ลบโพสต์
                </Button>
                <Button
                  size="small" variant="text" color="inherit" startIcon={<DismissIcon />}
                  disabled={actioningId === post.id}
                  onClick={() => runAction(post.id, 'dismiss-reports')}
                >
                  ยกเลิกการรายงาน (ไม่ดำเนินการ)
                </Button>
              </Stack>
            </Paper>
          ))}
        </Stack>
      )}

      <Dialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)}>
        <DialogTitle sx={{ fontWeight: 800 }}>ยืนยันการลบโพสต์</DialogTitle>
        <DialogContent>
          <Typography>ต้องการลบโพสต์นี้ของ <strong>{deleteTarget?.author_name}</strong> ใช่หรือไม่? การลบไม่สามารถย้อนกลับได้</Typography>
        </DialogContent>
        <DialogActions sx={{ p: 3 }}>
          <Button onClick={() => setDeleteTarget(null)} variant="outlined">ยกเลิก</Button>
          <Button onClick={confirmDelete} color="error" variant="contained" disabled={actioningId === deleteTarget?.id}>ลบโพสต์</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default CommunityModeration;
