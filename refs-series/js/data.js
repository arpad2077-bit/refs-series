/* Демо-контент и запасной источник данных.
   Используется, когда data/data.json не загрузился (например, при открытии
   index.html двойным щелчком с file://). Правки здесь никуда не публикуются —
   настоящий контент живёт в data/data.json и правится через admin.html.

   Поля:
     video.kind  — "youtube" | "file" | "embed"
     video.ref   — id/ссылка YouTube, путь/URL к mp4, либо URL для iframe
     notes[]     — отсылки: t (секунды), dur (сколько секунд показывать),
                   title, text, spoiler, links[{kind,label,url}]
                   link.kind — "watch" | "read" | "listen"
*/
window.SEED_DATA = {
  site: {
    title: 'Отсылки',
    subtitle: 'Сериалы, где каждая отсылка расшифрована прямо во время просмотра'
  },
  series: [
    {
      id: 'demo',
      title: 'Демо: как это работает',
      poster: '',
      description: 'Демонстрационная серия на примере короткометражки Big Buck Bunny (Blender Foundation, CC BY 3.0). В настоящем проекте здесь будет ваш сериал. Пояснения появляются поверх видео и одновременно лежат в списке под плеером.',
      episodes: [
        {
          id: 'demo-1',
          number: 1,
          title: 'Big Buck Bunny, часть 1',
          description: 'Смотрите: по ходу фильма всплывают пояснения. Таймкоды в списке кликабельны.',
          video: { kind: 'youtube', ref: 'aqz-KE-bpKQ' },
          notes: [
            {
              id: 'n1',
              t: 4,
              dur: 7,
              title: 'Blender Foundation',
              text: 'Фильм сделан силами сообщества Blender — бесплатного пакета для 3D-графики. Это не студия в привычном смысле: над короткометражкой работали добровольцы и разработчики самого Blender.',
              spoiler: false,
              links: [
                { kind: 'read', label: 'О проекте Blender', url: 'https://www.blender.org/about/' },
                { kind: 'watch', label: 'Другие фильмы Blender', url: 'https://studio.blender.org/films/' }
              ]
            },
            {
              id: 'n2',
              t: 16,
              dur: 7,
              title: 'Открытые лицензии',
              text: 'Big Buck Bunny распространяется по лицензии Creative Commons Attribution 3.0. Это значит: берите, монтируйте, переозвучивайте и даже продавайте — достаточно указать авторов. Поэтому этот фильм так часто используют для тестов плееров и субтитров.',
              spoiler: false,
              links: [
                { kind: 'read', label: 'Что такое CC BY 3.0', url: 'https://creativecommons.org/licenses/by/3.0/' }
              ]
            },
            {
              id: 'n3',
              t: 70,
              dur: 8,
              title: 'Главный герой',
              text: 'Толстый и добродушный кролик — намеренная противоположность типичному «крутому» герою мультфильмов. Авторы хотели проверить, может ли зритель сопереживать большому и неуклюжему персонажу.',
              spoiler: false,
              links: [
                { kind: 'watch', label: 'Как рисовали персонажа', url: 'https://studio.blender.org/projects/big-buck-bunny/' }
              ]
            },
            {
              id: 'n4',
              t: 201,
              dur: 8,
              title: 'Спойлер: кто такие грызуны',
              text: 'Троица мелких грызунов устроена как классический комедийный ансамбль: вожак, силач и трус. Их появление — отсылка к трём злодеям из старых slapstick-комедий.',
              spoiler: true,
              links: []
            }
          ]
        },
        {
          id: 'demo-2',
          number: 2,
          title: 'Big Buck Bunny, часть 2',
          description: 'Вторая серия нужна, чтобы проверить кнопку «Следующая серия» и автопереход по окончании.',
          video: { kind: 'youtube', ref: 'aqz-KE-bpKQ' },
          notes: [
            {
              id: 'm1',
              t: 300,
              dur: 8,
              title: 'Смена ритма',
              text: 'Во второй половине фильма монтаж ускоряется: средняя длина плана падает с 4 секунд до 1,5. Это стандартный приём, чтобы подготовить зрителя к финальной погоне.',
              spoiler: false,
              links: [
                { kind: 'read', label: 'Ритм монтажа (введение)', url: 'https://ru.wikipedia.org/wiki/Монтаж' }
              ]
            },
            {
              id: 'm2',
              t: 460,
              dur: 8,
              title: 'Финал и титры',
              text: 'Титры сделаны той же командой, что и вся графика, — в Blender. Если поставить этот фильм на паузу на титрах, можно увидеть десятки имён добровольцев.',
              spoiler: true,
              links: []
            }
          ]
        }
      ]
    }
  ]
};
