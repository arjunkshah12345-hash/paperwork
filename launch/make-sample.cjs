const {PDFDocument,StandardFonts,rgb}=require('pdf-lib');
(async()=>{const d=await PDFDocument.create();const f=await d.embedFont(StandardFonts.Helvetica);const b=await d.embedFont(StandardFonts.HelveticaBold);
const p=d.addPage([612,792]);
p.drawText('Northwind Coffee Co.',{x:56,y:720,size:22,font:b});
p.drawText('Q3 2026 regional results',{x:56,y:696,size:13,font:f,color:rgb(.35,.35,.35)});
p.drawText('Revenue grew in every region this quarter, led by the Pacific stores.',{x:56,y:660,size:11,font:f});
const rows=[['Region','Stores','Revenue','Growth'],['Pacific','42','$1,284,500.00','12.4%'],['Mountain','18','$402,900.00','6.1%'],['Midwest','27','$655,300.00','3.8%'],['Northeast','35','$1,019,750.00','9.2%'],['South','31','$788,100.00','4.5%']];
const xs=[56,200,300,450];let y=620;
for(const [i,r] of rows.entries()){const font=i?f:b;r.forEach((c,j)=>{const w=font.widthOfTextAtSize(c,11);const x=j===0?xs[0]:xs[j]+80-w;p.drawText(c,{x,y,size:11,font})});y-=22}
p.drawText('Figures are unaudited and rounded to the nearest cent.',{x:56,y:y-14,size:9,font:f,color:rgb(.4,.4,.4)});
require('fs').writeFileSync('launch/samples/northwind-q3.pdf',await d.save())})()
