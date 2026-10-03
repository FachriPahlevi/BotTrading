#property strict
#property version "1.3"

input string ApiUrl = "http://127.0.0.1:8000/api/mt5/candles";
input int CandleCount = 160;
input int RequestTimeoutMs = 2000;
// Empty means derive /api/mt5/account from the existing candle URL.
input string AccountApiUrl = "";

ENUM_TIMEFRAMES Timeframes[6] = {PERIOD_M1, PERIOD_M5, PERIOD_M15, PERIOD_H1, PERIOD_H4, PERIOD_D1};

string IntervalName(ENUM_TIMEFRAMES timeframe) {
   if(timeframe == PERIOD_M1) return "1m";
   if(timeframe == PERIOD_M5) return "5m";
   if(timeframe == PERIOD_M15) return "15m";
   if(timeframe == PERIOD_H1) return "1h";
   if(timeframe == PERIOD_H4) return "4h";
   return "1d";
}

string ResponseText(char &response[]) {
   return CharArrayToString(response, 0, -1, CP_UTF8);
}

int OnInit() {
   EventSetTimer(15);
   OnTimer();
   return(INIT_SUCCEEDED);
}

void OnDeinit(const int reason) {
   EventKillTimer();
}

void SendCandlesForTimeframe(ENUM_TIMEFRAMES tf) {
   MqlRates rates[];
   ArraySetAsSeries(rates, false);
   int copied = CopyRates(_Symbol, tf, 0, CandleCount, rates);
   if(copied < 60) {
      Print("Aurum bridge skipped ", IntervalName(tf), ": only ", copied, " candles available; needs 60.");
      return;
   }

   string body = StringFormat("{\"symbol\":\"%s\",\"interval\":\"%s\",\"candles\":[", _Symbol, IntervalName(tf));
   for(int index = 0; index < copied; index++) {
      if(index > 0) body += ",";
      body += StringFormat("{\"time\":%I64d,\"open\":%.8f,\"high\":%.8f,\"low\":%.8f,\"close\":%.8f,\"volume\":%I64d}", (long)rates[index].time * 1000, rates[index].open, rates[index].high, rates[index].low, rates[index].close, (long)rates[index].tick_volume);
   }
   body += "]}";
   char request[], response[];
   StringToCharArray(body, request, 0, -1, CP_UTF8);
   ArrayResize(request, ArraySize(request) - 1);
   string response_headers;
   ResetLastError();
   int status = WebRequest("POST", ApiUrl, "Content-Type: application/json\r\n", RequestTimeoutMs, request, response, response_headers);
   if(status == -1) {
      Print("Aurum bridge request failed for ", IntervalName(tf), ". Error code: ", GetLastError());
      return;
   }
   if(status != 200) {
      Print("Aurum bridge rejected ", IntervalName(tf), ". HTTP status: ", status, ". Check API Log sistem.");
      return;
   }
   Print("Aurum bridge sent ", _Symbol, " ", IntervalName(tf), ": ", copied, " candles. API response: ", ResponseText(response));
}

void OnTimer() {
   for(int i = 0; i < 6; i++) {
      SendCandlesForTimeframe(Timeframes[i]);
   }
   SendAccount();
}

string JsonString(string value) {
   StringReplace(value, "\\", "\\\\");
   StringReplace(value, "\"", "\\\"");
   StringReplace(value, "\r", "\\r");
   StringReplace(value, "\n", "\\n");
   StringReplace(value, "\t", "\\t");
   return "\"" + value + "\"";
}

void SendAccount() {
   string url = AccountApiUrl;
   if(url == "") {
      url = ApiUrl;
      if(StringReplace(url, "/mt5/candles", "/mt5/account") != 1) return;
   }
   long login = AccountInfoInteger(ACCOUNT_LOGIN);
   if(login <= 0) return;
   string server = AccountInfoString(ACCOUNT_SERVER);
   long mode = AccountInfoInteger(ACCOUNT_TRADE_MODE);
   string mode_name = mode == ACCOUNT_TRADE_MODE_DEMO ? "DEMO" : (mode == ACCOUNT_TRADE_MODE_REAL ? "REAL" : "CONTEST");
   double margin = AccountInfoDouble(ACCOUNT_MARGIN);
   string stamp = TimeToString(TimeGMT(), TIME_DATE|TIME_SECONDS);
   StringReplace(stamp, ".", "-");
   StringReplace(stamp, " ", "T");
   string body = "{\"login\":" + JsonString(IntegerToString(login))
      + ",\"name\":" + JsonString(AccountInfoString(ACCOUNT_NAME))
      + ",\"company\":" + JsonString(AccountInfoString(ACCOUNT_COMPANY))
      + ",\"server\":" + JsonString(server)
      + ",\"currency\":" + JsonString(AccountInfoString(ACCOUNT_CURRENCY))
      + ",\"trade_mode\":" + JsonString(mode_name)
      + ",\"leverage\":" + IntegerToString(AccountInfoInteger(ACCOUNT_LEVERAGE))
      + ",\"balance\":" + DoubleToString(AccountInfoDouble(ACCOUNT_BALANCE), 8)
      + ",\"equity\":" + DoubleToString(AccountInfoDouble(ACCOUNT_EQUITY), 8)
      + ",\"profit\":" + DoubleToString(AccountInfoDouble(ACCOUNT_PROFIT), 8)
      + ",\"credit\":" + DoubleToString(AccountInfoDouble(ACCOUNT_CREDIT), 8)
      + ",\"margin\":" + DoubleToString(margin, 8)
      + ",\"margin_free\":" + DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_FREE), 8)
      + ",\"margin_level\":" + (margin > 0 ? DoubleToString(AccountInfoDouble(ACCOUNT_MARGIN_LEVEL), 8) : "null")
      + ",\"positions_count\":" + IntegerToString(PositionsTotal())
      + ",\"connected\":" + (TerminalInfoInteger(TERMINAL_CONNECTED) ? "true" : "false")
      + ",\"updated_at\":" + JsonString(stamp + "Z") + "}";
   if(login != AccountInfoInteger(ACCOUNT_LOGIN) || server != AccountInfoString(ACCOUNT_SERVER)) return;
   char request[], response[];
   StringToCharArray(body, request, 0, -1, CP_UTF8);
   ArrayResize(request, ArraySize(request) - 1);
   string response_headers;
   int status = WebRequest("POST", url, "Content-Type: application/json\r\n", RequestTimeoutMs, request, response, response_headers);
   if(status == -1) {
      Print("Aurum account request failed. Error code: ", GetLastError());
      return;
   }
   if(status != 200) {
      Print("Aurum account update rejected. HTTP status: ", status, ". Check API Log sistem.");
      return;
   }
   Print("Aurum account snapshot sent. API response: ", ResponseText(response));
}
