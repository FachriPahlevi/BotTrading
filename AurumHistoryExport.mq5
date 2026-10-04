#property strict
#property script_show_inputs
#property version "1.0"
// Read-only history exporter. Does not send orders or replace the running EA.
input string HistorySymbol = "XAUUSDm";
input int Days = 90;
// REQUIRED: server clock minus UTC, in minutes, valid over the entire range.
// Split the export at offset/DST changes. Never infer from the current clock.
input int ServerUtcOffsetMinutes = 9999;

void OnStart() {
   if(Days < 1 || Days > 100 || MathAbs(ServerUtcOffsetMinutes) > 840) {
      Print("Set Days 1..100 and verified ServerUtcOffsetMinutes. Split range for DST changes.");
      return;
   }
   if(!TerminalInfoInteger(TERMINAL_CONNECTED) || !SymbolSelect(HistorySymbol,true)) {
      Print("Terminal disconnected or exact symbol unavailable.");
      return;
   }
   long account = AccountInfoInteger(ACCOUNT_LOGIN);
   string server = AccountInfoString(ACCOUNT_SERVER);
   datetime ending = TimeTradeServer();
   datetime beginning = ending - Days*86400;
   MqlRates bars[];
   int count = -1;
   for(int attempt=0; attempt<20 && !IsStopped(); attempt++) {
      count = CopyRates(HistorySymbol,PERIOD_M1,beginning,ending,bars);
      if(count > 0 && SeriesInfoInteger(HistorySymbol,PERIOD_M1,SERIES_SYNCHRONIZED)) break;
      Sleep(1000);
   }
   if(count < 2 || account != AccountInfoInteger(ACCOUNT_LOGIN) || server != AccountInfoString(ACCOUNT_SERVER)) {
      Print("History unavailable/account changed. Check Max bars in chart, load M1 history, then retry.");
      return;
   }
   string filename="Aurum_"+HistorySymbol+"_M1_"+IntegerToString((long)TimeLocal())+".csv";
   int file=FileOpen(filename,FILE_WRITE|FILE_CSV|FILE_ANSI,',',CP_UTF8);
   if(file == INVALID_HANDLE) { Print("Cannot create export file."); return; }
   FileWrite(file,"time","open","high","low","close","volume");
   int written=0;
   for(int i=0;i<count;i++) {
      if(bars[i].time+60>ending) continue;
      long utc=((long)bars[i].time-ServerUtcOffsetMinutes*60)*1000;
      FileWrite(file,IntegerToString(utc),DoubleToString(bars[i].open,10),DoubleToString(bars[i].high,10),
         DoubleToString(bars[i].low,10),DoubleToString(bars[i].close,10),IntegerToString(bars[i].tick_volume));
      written++;
   }
   FileClose(file);
   PrintFormat("Exported %d closed M1 bars to MQL5/Files/%s. Inspect actual range before import; download may be partial.",written,filename);
}
