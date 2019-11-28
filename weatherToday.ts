import { Log, OdnUtils } from "../../../odnUtils";
import { AccountConfigs, AccountData } from "../../../configs/accountConfigs";
import { OdnPlugins } from "../../../odnPlugins";
import { OdnTweets } from "../../../odnTweets";
import * as Forecast from "forecast";

export class WeatherToday {
  private static scheduleList: WeatherTodaySchedule[];
  private static forecast: Forecast;

  constructor(private accountData: AccountData, private nowDate: Date, private fullName: string) {}

  /**
   * プラグインのメイン処理を実行
   *
   * @param {(isProcessed?: boolean) => void} finish
   */
  run(finish: (isProcessed?: boolean) => void) {
    const schedule = WeatherToday.getMatchedSchedule(this.nowDate, WeatherToday.scheduleList);
    this.tweetWeather(schedule,(isSuccess) => {
      finish(isSuccess);
    });
  }

  /**
   * プラグインを実行するかどうか判定
   *
   * @param accountData
   * @param nowDate
   * @returns {boolean}
   */
  static isValid(accountData: AccountData, nowDate: Date): boolean {
    if (!this.scheduleList) {
      this.scheduleList = this.getSchedules(accountData);
      Log.t('scheduleList', this.scheduleList);
    }
    if (!this.forecast) {
      this.forecast = this.getForecast(this.getForecastKey(accountData));
      Log.t('forecast', this.forecast);
    }

    return this.getMatchedSchedule(nowDate, this.scheduleList) ? true : false;
  }

  private static getSchedules(accountData: AccountData): WeatherTodaySchedule[] {
    const key = `${WeatherTodayEnvKey.Schedules}_${accountData.userId}`;
    const raw = OdnPlugins.getEnvData(WeatherTodayEnvKey.FullName, key);
    let result: WeatherTodaySchedule[] = [];
    try {
      result = JSON.parse(raw);
    } catch(e) {
      Log.w("Invalid environments data format.", e);
    }
    return result;
  }

  private static getMatchedSchedule(nowDate: Date, scheduleList: WeatherTodaySchedule[]): WeatherTodaySchedule {
    const hours = nowDate.getHours();
    const minutes = nowDate.getMinutes();
    return scheduleList.find((s) => {
      return s && hours === s.hours && minutes === s.minutes;
    });
  }

  private static getForecastKey(accountData: AccountData): string {
    const key = OdnPlugins.getEnvData(WeatherTodayEnvKey.FullName, `${WeatherTodayEnvKey.ForecastKey}_${accountData.userId}`);
    if (!key) {
      Log.w("Could not load forecast key from environments.");
    }
    return key;
  }

  private static getForecast(key: string): Forecast {
    if (!key) {
      return null;
    }
    return new Forecast({
      service: "darksky",
      key: key,
      units: "celcius",
      cache: true,      // Cache API requests
      ttl: {            // How long to cache requests. Uses syntax from moment.js: http://momentjs.com/docs/#/durations/creating/
        minutes: 27,
        seconds: 45
      }
    });
  }

  private tweetWeather(schedule: WeatherTodaySchedule, cb: (isSuccess: boolean) => void) {
    WeatherToday.forecast.get(schedule.location.point, (error, weather: WeatherForcast) => {
      if (error) {
        Log.e("Error occurred at getting forecast resources.", error);
        return;
      }

      /** ツイートする予報の間隔 */
      const inter = 3;
      /** ツイートする予報の数 */
      const count = 8;
      let text = '';

      if (inter * count < (weather?.hourly?.data?.length || 0)) {
        const now = new Date(weather?.currently?.time * 1000);
        text += `${schedule.location.name}の天気予報\n\n`;
        // 3時間おきの天気
        for (let i = 0; i < count; i++) {
          const data = weather?.hourly?.data?.[i * inter];
          const time = new Date(data.time * 1000);
          const temp = Math.round(data.temperature);
          const precipProbability = Math.round(data.precipProbability * 100);
          text += `${time.getHours()}時\n`;
          text += `${this.getEmoji(data.icon)} ${temp}℃ ${precipProbability}％\n`;
          text += `\n`;
        }
      } else {
        text = `天気予報の取得に失敗しました。`;
      }

      // 文字数制限
      if (140 < text.length) {
        text = text.substr(0, 139);
        text += `…`;
      }

      const tweets = new OdnTweets(this.accountData);
      tweets.text = text;
      tweets.postTweet((isSuccess) => {
        cb(isSuccess);
      });
    });
  }

  private getEmoji(icon: WeatherIconTypes): string {
    // ☀️🌙🌧☃️🌨💨🌫☁️⛅️☁️
    return WeatherIcons[icon] || '❓';
  }
}

interface WeatherTodaySchedule {
  hours: number;
  minutes: number;
  location: Location;
  screenName: string;
}

interface Location {
  name: string;
  // 参考: http://www.geocoding.jp
  point: [number, number];
}

enum WeatherTodayEnvKey {
  FullName = "PLUGINSBATCHWEATHERTODAY", // プラグイン実行チェック時はプラグイン名が参照できないため定数として定義
  Schedules = "SCHEDULES",
  ForecastKey = "FORECAST_KEY"
}

const WeatherIcons = {
  'clear-day': '☀',
  'clear-night': '🌙',
  'rain': '🌧',
  'snow': '☃',
  'sleet': '🌨',
  'wind': '💨',
  'fog': '🌫',
  'cloudy': '☁',
  'partly-cloudy-day': '⛅',
  'partly-cloudy-night': '☁'
}

interface WeatherForcast {
  'currently': Weather;
  'daily': {
    'data': WeatherDetail[];
    'icon': WeatherIconTypes;
    'summary': string,
  };
  'expires': number;
  'flags': {
    'nearest-station': number;
    'sources': string[];
    'units': string;
  };
  'hourly': {
    'data': Weather[];
    'icon': WeatherIconTypes;
    'summary': string,
  }
  'latitude': number;
  'longitude': number;
  'offset': number;
  'timezone': string;
}

interface Weather {
  'apparentTemperature': number;
  'cloudCover': number;
  'dewPoint': number;
  'humidity': number;
  'icon': WeatherIconTypes;
  'ozone': number;
  'precipIntensity': number;
  'precipProbability': number;
  'precipType': string;
  'pressure': number;
  'summary': string;
  'temperature': number;
  'time': number;
  'uvIndex': number;
  'visibility': number;
  'windBearing': number;
  'windGust': number;
  'windSpeed': number;
}

interface WeatherDetail extends Weather {
  "apparentTemperatureHigh": number;
  "apparentTemperatureHighTime": number;
  "apparentTemperatureLow": number;
  "apparentTemperatureLowTime": number;
  "apparentTemperatureMax": number;
  "apparentTemperatureMaxTime": number;
  "apparentTemperatureMin": number;
  "apparentTemperatureMinTime": number;
  "moonPhase": number;
  "precipIntensityMax": number;
  "precipIntensityMaxTime": number;
  "sunriseTime": number;
  "sunsetTime": number;
  "temperatureHigh": number;
  "temperatureHighTime": number;
  "temperatureLow": number;
  "temperatureLowTime": number;
  "temperatureMax": number;
  "temperatureMaxTime": number;
  "temperatureMin": number;
  "temperatureMinTime": number;
  "uvIndexTime": number;
  "windGustTime": number;
}

type WeatherIconTypes = 'clear-day' | 'clear-night' | 'rain' | 'snow' | 'sleet' | 'wind' | 'fog' | 'cloudy' | 'partly-cloudy-day' | 'partly-cloudy-night';