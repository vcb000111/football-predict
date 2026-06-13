'use client';

import { useState, useEffect, useRef } from 'react';

export default function MatchSimulator({ match, isActive = true }) {
  const timeline = match.matchTimeline || [];
  const hasTimeline = timeline.length > 0;

  const [currentMinute, setCurrentMinute] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [speedMode, setSpeedMode] = useState('normal'); // 'normal' | 'skip' | 'pause'
  const [activeEvent, setActiveEvent] = useState(null);
  const [commentaryList, setCommentaryList] = useState([]);
  
  // Animation coordinates states
  const [ball, setBall] = useState({ x: 50, y: 30, scale: 1, rotate: 0 });
  const [players, setPlayers] = useState({
    homeGK: { x: 8, y: 30, name: 'GK', active: false },
    homeDF: { x: 30, y: 30, name: 'DF', active: false },
    homeFW: { x: 45, y: 30, name: 'FW', active: false },
    awayGK: { x: 92, y: 30, name: 'GK', active: false },
    awayDF: { x: 70, y: 30, name: 'DF', active: false },
    awayFW: { x: 55, y: 30, name: 'FW', active: false },
  });
  const [referee, setReferee] = useState({ x: 50, y: 20, activeCard: null }); // null | 'Y' | 'R'

  const timerRef = useRef(null);
  const isTransitioning = useRef(false);

  // Khởi động khi có trận đấu mới
  useEffect(() => {
    setCurrentMinute(1);
    setIsPlaying(false);
    setIsFinished(false);
    setSpeedMode('normal');
    setActiveEvent(null);
    setCommentaryList([]);
    setBall({ x: 50, y: 30, scale: 1, rotate: 0 });
    resetPlayerPositions();
    if (timerRef.current) clearInterval(timerRef.current);
  }, [match.id]);

  const resetPlayerPositions = () => {
    setPlayers({
      homeGK: { x: 8, y: 30, name: 'GK', active: false },
      homeDF: { x: 30, y: 15, name: 'DF', active: false },
      homeFW: { x: 45, y: 40, name: 'FW', active: false },
      awayGK: { x: 92, y: 30, name: 'GK', active: false },
      awayDF: { x: 70, y: 45, name: 'DF', active: false },
      awayFW: { x: 55, y: 20, name: 'FW', active: false },
    });
    setReferee({ x: 50, y: 20, activeCard: null });
  };

  // Lấy các phút có sự kiện quan trọng để tính toán Time Skip
  const eventMinutes = timeline.map(e => e.minute);

  // Thuật toán Time Skip & Simulation Engine
  useEffect(() => {
    if (!isPlaying || isFinished || !hasTimeline || !isActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const runCycle = () => {
      // 1. Tìm sự kiện ở phút hiện tại
      const minInteger = Math.floor(currentMinute);
      const event = timeline.find(e => e.minute === minInteger);

      if (event && !isTransitioning.current) {
        // Có sự kiện! Chuyển sang chế độ pause để diễn giải hoạt ảnh
        isTransitioning.current = true;
        setSpeedMode('pause');
        setActiveEvent(event);
        
        // Thêm vào danh sách log commentary (giới hạn 6 dòng mới nhất)
        setCommentaryList(prev => {
          const exists = prev.some(c => c.minute === event.minute && c.type === event.type);
          if (exists) return prev;
          return [{ minute: event.minute, detail: event.detail, type: event.type }, ...prev].slice(0, 6);
        });

        // Kích hoạt hoạt ảnh di chuyển bóng & cầu thủ dựa trên loại sự kiện
        triggerEventAnimation(event);

        // Sau 4.5 giây diễn xong hoạt ảnh, tiếp tục chạy thời gian
        setTimeout(() => {
          setIsPlaying(true);
          setSpeedMode('normal');
          setActiveEvent(null);
          setReferee(prev => ({ ...prev, activeCard: null }));
          isTransitioning.current = false;
          setCurrentMinute(prev => prev + 1);
        }, 4500);

        return;
      }

      if (isTransitioning.current) return;

      // 2. Thuật toán Time Skip: Xem sự kiện tiếp theo cách bao xa
      const nextEventMin = eventMinutes.find(m => m > currentMinute);
      
      if (!nextEventMin) {
        // Không còn sự kiện nào nữa, chạy nhanh về phút 90 để kết thúc
        setSpeedMode('skip');
        setCurrentMinute(prev => {
          if (prev >= 90) {
            setIsFinished(true);
            setIsPlaying(false);
            return 90;
          }
          return prev + 2;
        });
        simulateIdleMovement();
        return;
      }

      const diff = nextEventMin - currentMinute;

      if (diff > 2) {
        // Sự kiện tiếp theo còn xa (> 2 phút), tăng tốc độ (Skip)
        setSpeedMode('skip');
        setCurrentMinute(prev => prev + 1);
        simulateIdleMovement();
      } else {
        // Sự kiện đang đến gần (<= 2 phút), chạy chậm lại (Normal)
        setSpeedMode('normal');
        setCurrentMinute(prev => {
          const next = prev + 0.1; // Chạy số thực mượt mà
          if (next >= nextEventMin) {
            return nextEventMin; // Khớp chính xác phút sự kiện
          }
          return next;
        });
        simulateIdleMovement();
      }
    };

    // Chu kỳ cập nhật:
    // Chế độ skip: Cập nhật mỗi 150ms (chạy cực nhanh)
    // Chế độ normal: Cập nhật mỗi 400ms (chạy bình thường)
    const intervalTime = speedMode === 'skip' ? 150 : 400;
    timerRef.current = setInterval(runCycle, intervalTime);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isPlaying, currentMinute, speedMode, isFinished, hasTimeline, isActive]);

  // Hoạt ảnh ngẫu nhiên giữa sân khi không có sự kiện (Idle)
  const simulateIdleMovement = () => {
    // Bóng di chuyển ngẫu nhiên khu trung tuyến (35% - 65% x)
    const newBallX = 40 + Math.random() * 20;
    const newBallY = 15 + Math.random() * 30;
    setBall(prev => ({
      x: newBallX,
      y: newBallY,
      scale: 1,
      rotate: prev.rotate + 45
    }));

    // Cầu thủ tự động di chuyển nhẹ vây quanh bóng
    setPlayers(prev => ({
      homeGK: { ...prev.homeGK, x: 8 + (Math.random() - 0.5) * 2, y: 30 + (Math.random() - 0.5) * 4 },
      homeDF: { ...prev.homeDF, x: 28 + (newBallX - 50) * 0.1, y: 20 + (newBallY - 30) * 0.2 },
      homeFW: { ...prev.homeFW, x: 46 + (newBallX - 50) * 0.2, y: 35 + (newBallY - 30) * 0.3 },
      awayGK: { ...prev.awayGK, x: 92 + (Math.random() - 0.5) * 2, y: 30 + (Math.random() - 0.5) * 4 },
      awayDF: { ...prev.awayDF, x: 72 + (newBallX - 50) * 0.1, y: 40 + (newBallY - 30) * 0.2 },
      awayFW: { ...prev.awayFW, x: 54 + (newBallX - 50) * 0.2, y: 25 + (newBallY - 30) * 0.3 }
    }));

    // Trọng tài đi sau bóng
    setReferee(prev => ({
      ...prev,
      x: newBallX - 5 + Math.random() * 10,
      y: newBallY + 5 + Math.random() * 5
    }));
  };

  // Hoạt ảnh đặc biệt cho sự kiện
  const triggerEventAnimation = (event) => {
    const isHome = event.team === 'home';
    
    // Reset active highlight
    setPlayers(prev => {
      const updated = { ...prev };
      Object.keys(updated).forEach(k => { updated[k].active = false; });
      return updated;
    });

    switch (event.type) {
      case 'kickoff':
        // Đưa bóng về tâm sân, cầu thủ tề tựu xung quanh
        setBall({ x: 50, y: 30, scale: 1.3, rotate: 0 });
        setReferee({ x: 50, y: 23, activeCard: null });
        setPlayers({
          homeGK: { x: 8, y: 30, name: 'GK', active: false },
          homeDF: { x: 35, y: 20, name: 'DF', active: false },
          homeFW: { x: 48, y: 31, name: 'FW', active: true },
          awayGK: { x: 92, y: 30, name: 'GK', active: false },
          awayDF: { x: 65, y: 40, name: 'DF', active: false },
          awayFW: { x: 52, y: 29, name: 'FW', active: true },
        });
        break;

      case 'pass':
        // Chuyền bóng tới vị trí ngẫu nhiên ở biên hoặc vòng cấm
        const passX = isHome ? 75 : 25;
        const passY = 15 + Math.random() * 30;
        setBall({ x: passX, y: passY, scale: 1.1, rotate: 180 });
        setPlayers(prev => ({
          ...prev,
          homeFW: { x: isHome ? passX - 2 : prev.homeFW.x, y: isHome ? passY : prev.homeFW.y, name: 'FW', active: isHome },
          awayFW: { x: !isHome ? passX + 2 : prev.awayFW.x, y: !isHome ? passY : prev.awayFW.y, name: 'FW', active: !isHome }
        }));
        break;

      case 'shoot':
      case 'save':
        // Cầu thủ dắt bóng đến vòng cấm địa và sút
        const sX = isHome ? 80 : 20;
        const sY = 25 + Math.random() * 10;
        const targetGoalX = isHome ? 96 : 4;
        const targetGoalY = 27 + Math.random() * 6;

        // B1: Cầu thủ dẫn bóng
        setPlayers(prev => ({
          ...prev,
          homeFW: { x: isHome ? sX : prev.homeFW.x, y: isHome ? sY : prev.homeFW.y, name: 'FW', active: isHome },
          awayFW: { x: !isHome ? sX : prev.awayFW.x, y: !isHome ? sY : prev.awayFW.y, name: 'FW', active: !isHome }
        }));
        setBall({ x: sX, y: sY, scale: 1, rotate: 90 });

        // B2: Sút bóng (sau 1.2s)
        setTimeout(() => {
          setBall({ x: targetGoalX, y: targetGoalY, scale: 1.4, rotate: 360 });
          // Thủ môn đối phương bay người cản phá
          setPlayers(prev => ({
            ...prev,
            homeGK: { ...prev.homeGK, y: !isHome ? targetGoalY : prev.homeGK.y, active: !isHome },
            awayGK: { ...prev.awayGK, y: isHome ? targetGoalY : prev.awayGK.y, active: isHome }
          }));
        }, 1200);

        // B3: Đẩy bóng ra biên nếu là SAVE (sau 2.4s)
        if (event.type === 'save') {
          setTimeout(() => {
            const saveOutX = isHome ? 98 : 2;
            const saveOutY = Math.random() > 0.5 ? 5 : 55;
            setBall({ x: saveOutX, y: saveOutY, scale: 0.9, rotate: 720 });
          }, 2400);
        }
        break;

      case 'goal':
        // Sút tung lưới rung bần bật
        const gX = isHome ? 82 : 18;
        const gY = 28 + Math.random() * 4;
        const goalNetX = isHome ? 97.5 : 2.5;
        const goalNetY = 29 + Math.random() * 2;

        setPlayers(prev => ({
          ...prev,
          homeFW: { x: isHome ? gX : prev.homeFW.x, y: isHome ? gY : prev.homeFW.y, name: 'FW', active: isHome },
          awayFW: { x: !isHome ? gX : prev.awayFW.x, y: !isHome ? gY : prev.awayFW.y, name: 'FW', active: !isHome }
        }));
        setBall({ x: gX, y: gY, scale: 1, rotate: 180 });

        // Bóng vào lưới
        setTimeout(() => {
          setBall({ x: goalNetX, y: goalNetY, scale: 1.5, rotate: 540 });
        }, 1000);

        // Chạy ra góc ăn mừng (sau 2.2s)
        setTimeout(() => {
          const celebrateX = isHome ? 94 : 6;
          const celebrateY = Math.random() > 0.5 ? 8 : 52;
          setPlayers(prev => ({
            ...prev,
            homeFW: { x: isHome ? celebrateX : prev.homeFW.x, y: isHome ? celebrateY : prev.homeFW.y, name: '🎉', active: isHome },
            homeDF: { x: isHome ? celebrateX - 4 : prev.homeDF.x, y: isHome ? celebrateY : prev.homeDF.y, name: 'DF', active: isHome },
            awayFW: { x: !isHome ? celebrateX : prev.awayFW.x, y: !isHome ? celebrateY : prev.awayFW.y, name: '🎉', active: !isHome },
            awayDF: { x: !isHome ? celebrateX + 4 : prev.awayDF.x, y: !isHome ? celebrateY : prev.awayDF.y, name: 'DF', active: !isHome }
          }));
        }, 2200);
        break;

      case 'yellow_card':
      case 'red_card':
        // Phạm lỗi, trọng tài chạy lại rút thẻ
        const foulX = 30 + Math.random() * 40;
        const foulY = 15 + Math.random() * 30;
        
        setBall({ x: foulX, y: foulY, scale: 0.8, rotate: 0 });
        setPlayers(prev => ({
          ...prev,
          homeDF: { ...prev.homeDF, x: foulX - 2, y: foulY, active: isHome },
          awayDF: { ...prev.awayDF, x: foulX + 2, y: foulY, active: !isHome }
        }));

        // Trọng tài chạy lại rút thẻ sau 1.5 giây
        setTimeout(() => {
          setReferee({
            x: foulX,
            y: foulY - 3,
            activeCard: event.type === 'yellow_card' ? 'Y' : 'R'
          });
        }, 1500);
        break;

      case 'foul':
        // Cắt còi phạm lỗi
        const fx = 30 + Math.random() * 40;
        const fy = 15 + Math.random() * 30;
        setBall({ x: fx, y: fy, scale: 0.8, rotate: 0 });
        setReferee({ x: fx - 3, y: fy + 3, activeCard: null });
        break;

      case 'corner':
        // Sút phạt góc
        const cornerX = isHome ? 99 : 1;
        const cornerY = Math.random() > 0.5 ? 1 : 59;
        
        setBall({ x: cornerX, y: cornerY, scale: 1.1, rotate: 0 });
        
        // Quả tạt bóng bổng vào trung lộ (sau 1.5s)
        setTimeout(() => {
          setBall({ x: isHome ? 86 : 14, y: 30, scale: 1.6, rotate: 360 });
        }, 1500);
        break;

      case 'substitution':
        // Thay người, cầu thủ di chuyển về biên dọc
        setPlayers(prev => ({
          ...prev,
          homeFW: { ...prev.homeFW, x: isHome ? 50 : prev.homeFW.x, y: isHome ? 57 : prev.homeFW.y, name: '🔄', active: isHome },
          awayFW: { ...prev.awayFW, x: !isHome ? 50 : prev.awayFW.x, y: !isHome ? 57 : prev.awayFW.y, name: '🔄', active: !isHome }
        }));
        break;

      case 'half_time':
      case 'full_time':
        // Hết hiệp / Hết giờ, bóng về tâm, cầu thủ tản ra
        setBall({ x: 50, y: 30, scale: 0.8, rotate: 0 });
        setReferee({ x: 50, y: 28, activeCard: null });
        break;

      default:
        simulateIdleMovement();
        break;
    }
  };

  const handlePlayPause = () => {
    if (isFinished) {
      // Restart
      setCurrentMinute(1);
      setIsFinished(false);
      setCommentaryList([]);
      setBall({ x: 50, y: 30, scale: 1, rotate: 0 });
      resetPlayerPositions();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSliderChange = (e) => {
    const min = parseFloat(e.target.value);
    setCurrentMinute(min);
    setIsFinished(min >= 90);
    setActiveEvent(null);
    setReferee(prev => ({ ...prev, activeCard: null }));
    isTransitioning.current = false;
    
    // Đồng bộ lại log commentary phù hợp với thời gian tua
    const filteredCommentaries = timeline
      .filter(evt => evt.minute <= min)
      .sort((a, b) => b.minute - a.minute)
      .map(evt => ({ minute: evt.minute, detail: evt.detail, type: evt.type }))
      .slice(0, 6);
    setCommentaryList(filteredCommentaries);
  };

  const getEventIcon = (type) => {
    switch (type) {
      case 'goal': return '⚽';
      case 'yellow_card': return '🟨';
      case 'red_card': return '🟥';
      case 'substitution': return '🔄';
      case 'half_time':
      case 'full_time': return '⏱️';
      case 'foul': return '🛑';
      case 'save': return '🧤';
      case 'shoot': return '💥';
      default: return '📢';
    }
  };

  return (
    <div className="glass-panel rounded-2xl p-4 mb-4 border border-card-border overflow-hidden relative bg-[#0D1527]/90 shadow-2xl">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-accent"></div>
      
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-3.5 gap-2 border-b border-card-border/30 pb-3">
        <div>
          <h3 className="text-white font-black text-sm flex items-center space-x-1.5 uppercase tracking-wider">
            <span className="text-primary animate-pulse">●</span>
            <span>MÔ PHỎNG TRẬN ĐẤU 2D (LIVE SIMULATOR)</span>
          </h3>
          <p className="text-[10px] text-gray-400 mt-0.5">Mô phỏng vị trí bóng và cầu thủ thời gian thực kết hợp thuật toán Time Skip thời gian chết</p>
        </div>

        {/* State Indicator Badge */}
        <div className="flex items-center space-x-2">
          {speedMode === 'skip' && (
            <span className="bg-secondary/15 text-secondary border border-secondary/20 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider animate-pulse">
              ⏩ Đang Skip thời gian chết
            </span>
          )}
          {speedMode === 'pause' && (
            <span className="bg-primary/15 text-primary border border-primary/20 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider animate-bounce">
              🔥 Có tình huống!
            </span>
          )}
          {speedMode === 'normal' && isPlaying && (
            <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider">
              ⚽ Trực tiếp bóng lăn
            </span>
          )}
          {!isPlaying && !isFinished && (
            <span className="bg-gray-500/10 text-gray-400 border border-gray-500/20 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider">
              ⏸️ Tạm dừng
            </span>
          )}
          {isFinished && (
            <span className="bg-red-500/10 text-red-400 border border-red-500/20 font-bold px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider">
              🏁 Trận đấu kết thúc
            </span>
          )}
        </div>
      </div>

      {!hasTimeline ? (
        <div className="py-12 text-center text-xs text-gray-400 border border-dashed border-card-border/50 rounded-xl">
          🦖 Trận đấu chưa bắt đầu hoặc chưa có dữ liệu diễn biến. Vui lòng bấm cập nhật kết quả tự động để lấy dữ liệu.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          
          {/* SÂN BÓNG SVG 2D (7 cột) */}
          <div className="lg:col-span-7 flex flex-col justify-center items-center">
            <div className="relative w-full aspect-[100/60] rounded-xl overflow-hidden border border-card-border bg-[#102A1A] shadow-inner select-none">
              <svg viewBox="0 0 100 60" className="w-full h-full">
                {/* Cỏ sân bóng nền */}
                <rect width="100" height="60" fill="#1b4d22" />
                
                {/* Sọc cỏ (Shading) */}
                {[...Array(10)].map((_, idx) => (
                  <rect 
                    key={idx} 
                    x={idx * 10} 
                    y="0" 
                    width="5" 
                    height="60" 
                    fill="#1e5426" 
                  />
                ))}

                {/* Khung viền sân bóng */}
                <rect x="2" y="2" width="96" height="56" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                
                {/* Vạch kẻ giữa sân */}
                <line x1="50" y1="2" x2="50" y2="58" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                
                {/* Vòng tròn trung tâm */}
                <circle cx="50" cy="30" r="9.15" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                <circle cx="50" cy="30" r="0.8" fill="rgba(255,255,255,0.8)" />

                {/* Vòng cấm địa Home (Trái) */}
                <rect x="2" y="12" width="14" height="36" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                <rect x="2" y="20" width="5" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                <circle cx="11.5" cy="30" r="0.6" fill="rgba(255,255,255,0.8)" />
                <path d="M 16 23 A 9.15 9.15 0 0 1 16 37" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />

                {/* Vòng cấm địa Away (Phải) */}
                <rect x="84" y="12" width="14" height="36" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                <rect x="93" y="20" width="5" height="20" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                <circle cx="88.5" cy="30" r="0.6" fill="rgba(255,255,255,0.8)" />
                <path d="M 84 23 A 9.15 9.15 0 0 0 84 37" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />

                {/* Cột dọc & Khung thành hai bên */}
                {/* Gôn Home */}
                <rect x="0.2" y="25" width="1.8" height="10" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />
                <line x1="2" y1="25" x2="2" y2="35" stroke="rgba(255,255,255,0.9)" strokeWidth="1" />
                {/* Gôn Away */}
                <rect x="98" y="25" width="1.8" height="10" fill="none" stroke="rgba(255,255,255,0.7)" strokeWidth="0.8" />
                <line x1="98" y1="25" x2="98" y2="35" stroke="rgba(255,255,255,0.9)" strokeWidth="1" />

                {/* BỤNG GÓC (Corner Arcs) */}
                <path d="M 2 3.5 A 1.5 1.5 0 0 1 3.5 2" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                <path d="M 2 56.5 A 1.5 1.5 0 0 0 3.5 58" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                <path d="M 98 3.5 A 1.5 1.5 0 0 0 96.5 2" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />
                <path d="M 98 56.5 A 1.5 1.5 0 0 1 96.5 58" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.6" />

                {/* VẼ CẦU THỦ HOME (Màu Xanh Neon) */}
                {Object.keys(players).filter(k => k.startsWith('home')).map(key => {
                  const p = players[key];
                  return (
                    <g key={key} style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)`, transition: isTransitioning.current ? 'all 1.5s ease-out' : 'all 0.5s ease-out' }} className="cursor-pointer">
                      <circle cx="0" cy="0" r="2.2" fill="#10B981" stroke="#ffffff" strokeWidth="0.5" className={p.active ? "animate-pulse" : ""} />
                      {p.active && (
                        <circle cx="0" cy="0" r="3.8" fill="none" stroke="#10B981" strokeWidth="0.4" className="animate-ping" />
                      )}
                      <text x="0" y="0.8" fill="#000000" fontSize="2.2" fontWeight="black" textAnchor="middle" pointerEvents="none">{p.name}</text>
                    </g>
                  );
                })}

                {/* VẼ CẦU THỦ AWAY (Màu Đỏ/Cam Neon) */}
                {Object.keys(players).filter(k => k.startsWith('away')).map(key => {
                  const p = players[key];
                  return (
                    <g key={key} style={{ transform: `translate3d(${p.x}px, ${p.y}px, 0)`, transition: isTransitioning.current ? 'all 1.5s ease-out' : 'all 0.5s ease-out' }} className="cursor-pointer">
                      <circle cx="0" cy="0" r="2.2" fill="#EF4444" stroke="#ffffff" strokeWidth="0.5" className={p.active ? "animate-pulse" : ""} />
                      {p.active && (
                        <circle cx="0" cy="0" r="3.8" fill="none" stroke="#EF4444" strokeWidth="0.4" className="animate-ping" />
                      )}
                      <text x="0" y="0.8" fill="#ffffff" fontSize="2.2" fontWeight="black" textAnchor="middle" pointerEvents="none">{p.name}</text>
                    </g>
                  );
                })}

                {/* VẼ TRỌNG TÀI (Màu Dạ Quang Còi) */}
                <g style={{ transform: `translate3d(${referee.x}px, ${referee.y}px, 0)`, transition: 'all 1.2s ease-out' }}>
                  <circle cx="0" cy="0" r="1.6" fill="#FBBF24" stroke="#000000" strokeWidth="0.4" />
                  <text x="0" y="0.6" fill="#000000" fontSize="1.8" fontWeight="black" textAnchor="middle">👤</text>
                  
                  {/* Thẻ phạt nổi bật trên đầu trọng tài */}
                  {referee.activeCard && (
                    <rect 
                      x="-1.1" 
                      y="-4.5" 
                      width="2.2" 
                      height="3" 
                      rx="0.3" 
                      fill={referee.activeCard === 'Y' ? '#FBBF24' : '#EF4444'} 
                      stroke="#ffffff" 
                      strokeWidth="0.3" 
                      className="animate-bounce"
                    />
                  )}
                </g>

                {/* VẼ QUẢ BÓNG ⚽ */}
                <g style={{ transform: `translate3d(${ball.x}px, ${ball.y}px, 0) scale(${ball.scale}) rotate(${ball.rotate}deg)`, transition: isTransitioning.current ? 'all 1.2s ease-out' : 'all 0.4s ease-out' }}>
                  <circle cx="0" cy="0" r="1.2" fill="#ffffff" stroke="#000000" strokeWidth="0.25" />
                  <text x="0" y="0.5" fontSize="1.6" textAnchor="middle">⚽</text>
                  {/* Bóng có vệt bóng mờ khi sút căng */}
                  {ball.scale > 1.2 && (
                    <circle cx="0" cy="0" r="2" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.3" className="animate-ping" />
                  )}
                </g>
              </svg>
            </div>
          </div>

          {/* NHẬN ĐỊNH / LOG COMMENTARY (5 cột) */}
          <div className="lg:col-span-5 flex flex-col justify-between h-[210px] sm:h-auto">
            {/* Live Commentary Box */}
            <div className="flex-1 bg-[#090D16] border border-card-border/60 rounded-xl p-3.5 flex flex-col overflow-hidden relative min-h-[160px] max-h-[260px]">
              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2 flex justify-between items-center border-b border-card-border/30 pb-1.5">
                <span>Tường thuật trực tiếp (Live Commentary)</span>
                <span className="text-primary animate-pulse">● LIVE VN</span>
              </div>

              {/* Dòng commentary chạy chữ */}
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 custom-scrollbar text-xs">
                {commentaryList.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-gray-400 italic text-[11px] py-8">
                    Nhấn nút Giao Bóng để bắt đầu theo dõi trận đấu...
                  </div>
                ) : (
                  commentaryList.map((log, idx) => (
                    <div 
                      key={idx} 
                      className={`p-2 rounded-lg border leading-relaxed flex items-start space-x-2 animate-fade-in ${
                        idx === 0 
                          ? 'bg-primary/10 border-primary/20 text-white' 
                          : 'bg-[#151E2E]/30 border-card-border/40 text-gray-400'
                      }`}
                    >
                      <span className="font-bold font-mono text-primary text-[10px] bg-primary/10 px-1.5 py-0.2 rounded mt-0.5">
                        {Math.floor(log.minute)}'
                      </span>
                      <div className="flex-1 text-[11px]">
                        <span className="mr-1">{getEventIcon(log.type)}</span>
                        <span>{log.detail}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </div>
      )}

      {/* THANH ĐIỀU KHIỂN WIDGET */}
      {hasTimeline && (
        <div className="mt-3.5 pt-3 border-t border-card-border/30 flex flex-col sm:flex-row items-center justify-between gap-3.5 text-xs text-gray-300">
          
          {/* Nút Play/Pause */}
          <div className="flex items-center space-x-3.5">
            <button
              onClick={handlePlayPause}
              className={`font-black uppercase tracking-wider py-1.5 px-4 rounded-xl text-[10px] transition-all flex items-center space-x-1.5 shadow-md active:scale-95 cursor-pointer ${
                isPlaying 
                  ? 'bg-rose-500 text-white hover:bg-rose-600 shadow-rose-600/10' 
                  : 'bg-primary text-black hover:bg-primary/90 shadow-primary/10'
              }`}
            >
              <span>{isFinished ? '🔁 XEM LẠI' : (isPlaying ? '⏸️ TẠM DỪNG' : '⚽ GIAO BÓNG')}</span>
            </button>

            {/* Đồng hồ hiển thị phút */}
            <span className="font-mono text-white font-extrabold text-sm bg-card-border/60 border border-card-border/80 px-2.5 py-1 rounded-xl shadow-inner min-w-[70px] text-center glow-green">
              ⏱️ {Math.floor(currentMinute)}'
            </span>
          </div>

          {/* Slider tua nhanh thời gian */}
          <div className="flex-1 w-full flex items-center space-x-3.5">
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider select-none">Tua nhanh</span>
            <input
              type="range"
              min="1"
              max="90"
              value={currentMinute}
              onChange={handleSliderChange}
              className="flex-1 h-1.5 bg-card-border rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <span className="font-mono text-[11px] text-gray-500 font-bold">90'</span>
          </div>

        </div>
      )}
    </div>
  );
}
