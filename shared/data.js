// CGV 대구죽전 Cinema 03. Seat positions follow the provided auditorium sign.
window.CINEMA = {
  venue:'CGV 대구죽전', hall:'3관', count:34,
  rows:['A','B','C','D'],
  seats: Array.from({length:10},(_,i)=>i+1),
  available:['B10','C7','C10','D10'],
  photo:{},
  sourceName:{'B10':'B열10번 뷰.jpg','C7':'C열7번뷰.jpg','C10':'C열10번뷰.jpg','D10':'죽전3관 D열10번뷰.jpg'},
  seatIds:['A','B','C'].flatMap(r=>Array.from({length:10},(_,i)=>r+(i+1))).concat(['D1','D2','D9','D10']),
  isRealSeat:id=>['A','B','C'].includes(id[0]) || ['D1','D2','D9','D10'].includes(id),
  accessible:id=>['D1','D2'].includes(id),
  label:id=>`${id[0]}열 ${id.substring(1)}번`,
  status:id=>window.CINEMA.photo[id]?'photo':'waiting'
};
