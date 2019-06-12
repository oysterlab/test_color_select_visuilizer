import * as tf from '@tensorflow/tfjs'

class FontColorModel {
  constructor() {
    const model = new tf.sequential()

    model.add(tf.layers.dense({
      inputShape: [3],
      units: 5,
      activation: 'relu'
    }))

    model.add(tf.layers.dense({
      units: 3,
      activation: 'relu'
    }))

    model.add(tf.layers.dense({
      units: 1,
      activation: 'sigmoid'
    }))

    model.compile({
      optimizer: 'adam',
      loss: 'binaryCrossentropy',
      metrics: ['accuracy']
    })

    this.model = model
    this.done = false
  }

  fit(dataset, onEpochEnd) {
    const { model } = this
    const { xs, ys } = dataset
    const X = tf.variable(tf.tensor(xs))
    const Y = tf.variable(tf.tensor(ys))

    const batchSize = parseInt(xs.length * 0.6)
    model.fit(X, Y, {
      epochs: 1024,
      batchSize,
      callbacks: {
        onEpochEnd: (epoch, loss) => {
          if (onEpochEnd) {
            onEpochEnd(epoch, loss, model)
          }
        },
        onTrainEnd: () => {
          this.done = true
        }
      }
    })
  }

  predict(dataset) {
    const { model } = this
    const X = tf.variable(tf.tensor(dataset))
    return model.predict(X).dataSync()
  }

  isDone() {
    return this.done
  }

}

export default FontColorModel