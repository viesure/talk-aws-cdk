package io.viesure.legacystorage

import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication
import org.springframework.cloud.aws.messaging.config.annotation.EnableSqs
import org.springframework.cloud.aws.messaging.listener.annotation.SqsListener
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.config.EnableJpaRepositories
import org.springframework.messaging.converter.MappingJackson2MessageConverter
import org.springframework.stereotype.Repository
import javax.persistence.Entity
import javax.persistence.GeneratedValue
import javax.persistence.GenerationType
import javax.persistence.Id

@EnableSqs
@SpringBootApplication
@EnableJpaRepositories
class LegacyStorageApplication(@Autowired val repo: DataRepository) {
    @SqsListener("#{environment.QUEUE_NAME}")
    fun retrieveMessage(message: DataMessage) {
        println("Retrieved data: " + message.data)
        Thread.sleep(1000)
        repo.save(Data(0, message.timestamp, message.data))
    }
}


fun main(args: Array<String>) {
    runApplication<LegacyStorageApplication>(*args)
}

@Configuration
class SqsConfig {
    @Bean
    fun messageConverter(): MappingJackson2MessageConverter {
        return MappingJackson2MessageConverter()
    }
}

@Repository
interface DataRepository : JpaRepository<Data, Long>

data class DataMessage(var timestamp: String, var data: String) {
    constructor() : this("", "")
}

@Entity
data class Data(
        @Id
        @GeneratedValue(strategy = GenerationType.IDENTITY)
        val id: Long,

        val timestamp: String,
        val data: String
)

